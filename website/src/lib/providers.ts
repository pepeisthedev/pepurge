import { hardhat, robinhood } from "@reown/appkit/networks"
import { ethers } from "ethers"

const fallbackRpcUrl = import.meta.env.VITE_FALLBACK_RPC_URL?.trim()
const expectedChainId =
    import.meta.env.VITE_CHAIN_ID === String(hardhat.id)
        ? hardhat.id
        : robinhood.id

let fallbackProvider: ethers.JsonRpcProvider | undefined

export function createWalletProvider(walletProvider: unknown) {
    return new ethers.BrowserProvider(
        walletProvider as ethers.Eip1193Provider,
    )
}

function getFallbackProvider() {
    if (!fallbackRpcUrl) return undefined
    fallbackProvider ??= new ethers.JsonRpcProvider(
        fallbackRpcUrl,
        expectedChainId,
    )
    return fallbackProvider
}

export async function withReadProvider<T>(
    walletProvider: unknown,
    read: (provider: ethers.AbstractProvider) => Promise<T>,
): Promise<T> {
    try {
        return await read(createWalletProvider(walletProvider))
    } catch (walletError) {
        const backup = getFallbackProvider()
        if (!backup) throw walletError

        console.warn("Wallet RPC read failed; retrying with fallback RPC", walletError)
        return await read(backup)
    }
}
