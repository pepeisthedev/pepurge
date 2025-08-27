"use client"

import { useState, useEffect } from "react"
import { useAppKit, useAppKitAccount, useAppKitProvider } from "@reown/appkit/react"
import { ethers } from "ethers"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { 
    Skull, 
    LogOut, 
    Zap,
    Ghost,
    Coins,
    Sparkles
} from "lucide-react"
import pepurgeAbi from "../assets/abis/pepurge.json"

const pepurgeContractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;
const mintPrice = import.meta.env.VITE_MINT_PRICE;

export default function MintPage() {
    const { open } = useAppKit()
    const { isConnected, address } = useAppKitAccount()
    const { walletProvider } = useAppKitProvider("eip155")

    const [isMinting, setIsMinting] = useState<boolean>(false)
    const [showResultModal, setShowResultModal] = useState<boolean>(false)
    const [mintResult, setMintResult] = useState<{
        success: boolean
        message: string
        tokenId?: string
        transactionHash?: string
    } | null>(null)
    
    const [totalSupply, setTotalSupply] = useState<number>(0)

    // Function to truncate wallet address
    const truncateAddress = (address: string) => {
        return `${address.slice(0, 6)}...${address.slice(-4)}`
    }

    // Function to disconnect wallet
    const handleDisconnect = () => {
        open()
    }

    // Fetch contract info when connected
    useEffect(() => {
        if (isConnected && address) {
            fetchContractInfo()
        }
    }, [isConnected, address])

    const fetchContractInfo = async () => {
        try {
            if (!walletProvider) return

            const ethersProvider = new ethers.BrowserProvider(walletProvider as ethers.Eip1193Provider)
            const contract = new ethers.Contract(pepurgeContractAddress, pepurgeAbi, ethersProvider)
            


            try {
                const supply = await contract.totalMinted()
                console.log("Total minted:", supply)
                setTotalSupply(Number(supply))
            } catch (error) {
                console.log("Total minted not available:", error)
                setTotalSupply(0)
            }

        
        } catch (error) {
            console.error("Error fetching contract info:", error)
        }
    }

    const handleMint = async () => {
        if (!walletProvider) return
        
        try {
            setIsMinting(true)
            const ethersProvider = new ethers.BrowserProvider(walletProvider as ethers.Eip1193Provider)
            const signer = await ethersProvider.getSigner()
            const contract = new ethers.Contract(pepurgeContractAddress, pepurgeAbi, signer)
            
            // Get mint price from contract (returns value in wei)
            const mintPriceWei = await contract.mintPrice()
            console.log("Mint price from contract (wei):", mintPriceWei.toString())
            console.log("Mint price in ETH:", ethers.formatEther(mintPriceWei))
            
            const tx = await contract.mint({ value: mintPriceWei })
            const receipt = await tx.wait()
            
            // Try to extract token ID from events
            let tokenId = "Unknown"
            if (receipt.logs && receipt.logs.length > 0) {
                for (const log of receipt.logs) {
                    try {
                        const parsedLog = contract.interface.parseLog(log)
                        if (parsedLog && parsedLog.name === "Transfer" && parsedLog.args) {
                            tokenId = parsedLog.args.tokenId?.toString() || "Unknown"
                            break
                        }
                    } catch (e) {
                        // Continue looking for the right log
                    }
                }
            }
            
            setMintResult({
                success: true,
                message: "",
                tokenId: tokenId,
                transactionHash: tx.hash
            })
            setShowResultModal(true)
            
            // Refresh contract info
            await fetchContractInfo()
        } catch (error: any) {
            console.error("Mint failed:", error)
            
            let errorMessage = "SUMMONING FAILED!"
            if (error.reason) {
                errorMessage = error.reason
            } else if (error.message?.includes("insufficient funds")) {
                errorMessage = "INSUFFICIENT FUNDS FOR RITUAL"
            } else if (error.code === "ACTION_REJECTED") {
                errorMessage = "RITUAL REJECTED"
            } else if (error.message?.includes("exceeds balance")) {
                errorMessage = "INSUFFICIENT ETH BALANCE"
            }
            
            setMintResult({
                success: false,
                message: errorMessage
            })
            setShowResultModal(true)
        } finally {
            setIsMinting(false)
        }
    }

    if (!isConnected) {
        return (
            <div className="min-h-screen bg-[#b31c1e] flex items-center justify-center p-4 font-nosifer">
                <div className="text-center">
                    <div className="mb-8">
                        <img 
                            src="/Pepurge_Text.png" 
                            alt="Pepurge" 
                            className="w-[60vw] max-w-4xl mx-auto mb-4 drop-shadow-2xl"
                        />
                    </div>
                    <p className="text-2xl md:text-3xl text-black font-bold mb-8 opacity-90">
                        SUMMON YOUR PEPURGE
                    </p>
                    <Button 
                        onClick={() => open()}
                        className="bg-black text-[#b31c1e] hover:bg-red-900 hover:text-white border-4 border-black text-2xl font-bold py-6 px-12 shadow-2xl transform hover:scale-105 transition-all"
                    >
                        SUMMON WALLET
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#b31c1e] p-4 relative font-nosifer">
            {/* Blood drip effect */}
            <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-b from-red-900 to-transparent opacity-70"></div>
            
            {/* Wallet Indicator */}
            {isConnected && address && (
                <div className="absolute top-4 right-4 z-10">
                    <Button
                        onClick={handleDisconnect}
                        className="bg-black text-[#b31c1e] hover:bg-red-900 hover:text-white border-2 border-black px-4 py-2 text-sm"
                    >
                        <span className="mr-2">{truncateAddress(address)}</span>
                        <LogOut className="w-4 h-4" />
                    </Button>
                </div>
            )}

            {/* Header */}
            <div className="text-center mb-8 pt-16">
                <div className="max-w-6xl mx-auto">
                    <div className="flex items-center justify-center mb-6">
                        <img 
                            src="/Pepurge_Text.png" 
                            alt="Pepurge" 
                            className="w-[60vw] max-w-3xl mx-auto drop-shadow-2xl"
                        />
                    </div>
              
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-4xl mx-auto">
                <div className="bg-black border-4 border-red-800 p-8 rounded-lg shadow-2xl">
                    <div className="text-center space-y-6">
                        {/* Mint Info */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-center">
                                <img 
                                    src="/C1.png" 
                                    alt="Pepurge" 
                                    className="w-12 mr-4"
                                />
                                <h2 className="text-4xl font-bold text-[#b31c1e]">PEPURGE SUMMONING</h2>
                                <img 
                                    src="/C1.png" 
                                    alt="Pepurge" 
                                    className="w-12 ml-4"
                                />
                            </div>
                       
                        </div>

                        {/* Contract Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-8">
                            <div className="bg-red-900 border-2 border-red-600 p-4 rounded">
                                <div className="text-red-200 text-sm font-bold mb-1">MINT PRICE</div>
                                <div className="text-2xl font-bold text-red-100 flex items-center justify-center">
                                    {mintPrice} ETH
                                </div>
                            </div>
                            
                            <div className="bg-red-900 border-2 border-red-600 p-4 rounded">
                                <div className="text-red-200 text-sm font-bold mb-1">TOTAL SUMMONED</div>
                                <div className="text-2xl font-bold text-red-100 flex items-center justify-center">
                                    {totalSupply}
                                </div>
                            </div>
                            
                        
                                <div className="bg-red-900 border-2 border-red-600 p-4 rounded">
                                    <div className="text-red-200 text-sm font-bold mb-1">MAX SUPPLY</div>
                                    <div className="text-2xl font-bold text-red-100 flex items-center justify-center">
                                        10000
                                    </div>
                                </div>
                         
                        </div>

                        {/* Mint Button */}
                        <div className="space-y-4">
                            <Button
                                onClick={handleMint}
                                disabled={isMinting}
                                className="bg-[#b31c1e] hover:bg-red-700 text-black hover:text-white font-bold py-6 px-12 text-2xl border-4 border-black shadow-2xl transform hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none animate-pulse"
                            >
                                {isMinting ? (
                                    <>
                                        <Zap className="w-8 h-8 mr-3 animate-spin" />
                                        SUMMONING...
                                    </>
                                ) : (
                                    <>
                                        SUMMON PEPURGE
                                    </>
                                )}
                            </Button>
                            
                            <p className="text-[#b31c1e] text-lg opacity-80">
                                One Pepurge per ritual
                            </p>
                        </div>

                      
                    </div>
                </div>
            </div>

            {/* Result Modal */}
            <Dialog open={showResultModal} onOpenChange={setShowResultModal}>
                <DialogContent className="bg-[#b31c1e] border-4 border-black max-w-md">
                    <DialogHeader>
                        <DialogTitle className={`text-3xl font-nosifer text-center ${
                            mintResult?.success ? 'text-black' : 'text-red-900'
                        }`}>
                            {mintResult?.success ? '💀 SUCCESS! 💀' : '💀 FAILED! 💀'}
                        </DialogTitle>
                    </DialogHeader>
                    
                    {mintResult && (
                        <div className="space-y-6 text-center">
                            <div className="text-black font-nosifer text-lg">
                                {mintResult.message}
                            </div>
                            
                            {mintResult.success ? (
                                <div className="space-y-3">
                             
                                    {mintResult.tokenId !== "Unknown" && (
                                        <div className="text-black font-bold text-xl">
                                            Pepurge #{mintResult.tokenId}
                                        </div>
                                    )}
                                    <div className="bg-black border-2 border-red-800 p-4 rounded">
                                        <div className="text-[#b31c1e] text-sm space-y-1 font-nosifer">
                                            <p>👹 Pepurge has been summoned!</p>
                                            <p>⚔️ Get ready for battle!</p>
                                        </div>
                                    </div>
                                    {mintResult.transactionHash && (
                                        <div className="text-xs text-black opacity-70 break-all">
                                            TX: {mintResult.transactionHash}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="text-black font-bold">
                                        The summoning ritual has failed...
                                    </div>
                                    <div className="bg-black border-2 border-red-800 p-4 rounded">
                                        <div className="text-[#b31c1e] text-sm">
                                            <p>The dark forces reject your offering. Check your wallet and try again.</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            <Button
                                onClick={() => setShowResultModal(false)}
                                className="w-full bg-black text-[#b31c1e] hover:bg-gray-800 font-nosifer py-3 border-2 border-black"
                            >
                                CLOSE
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
