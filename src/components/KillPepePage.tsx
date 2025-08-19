"use client"

import { useState, useEffect } from "react"
import { useAppKit, useAppKitAccount, useAppKitProvider } from "@reown/appkit/react"
import { ethers } from "ethers"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Sword, Heart, Skull, X, LogOut, Clock } from "lucide-react"
import pepurgeAbi from "../assets/abis/pepurge.json"

const pepurgeContractAddress = "0x30E5d5F758E1B2f25b941EC54FF27058A92BA5cb"

interface PepeNFT {
    tokenId: string
    life: number
    pepeType: number
    imageUrl: string
    lastAttackTimestamp: number
    canAttack: boolean
    timeUntilNextAttack: string
}

export default function pepurgePage() {
    const { open } = useAppKit()
    const { isConnected, address } = useAppKitAccount()
    const { walletProvider } = useAppKitProvider("eip155")

    const [userPepes, setUserPepes] = useState<PepeNFT[]>([])
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const [showAttackModal, setShowAttackModal] = useState<boolean>(false)
    const [selectedPepe, setSelectedPepe] = useState<PepeNFT | null>(null)
    const [targetTokenId, setTargetTokenId] = useState<string>("")
    const [isAttacking, setIsAttacking] = useState<boolean>(false)
    const [showResultModal, setShowResultModal] = useState<boolean>(false)
    const [attackResult, setAttackResult] = useState<{
        success: boolean
        message: string
        attackerTokenId?: string
        targetTokenId?: string
    } | null>(null)

    // Function to truncate wallet address
    const truncateAddress = (address: string) => {
        return `${address.slice(0, 1)}...${address.slice(-5)}`
    }

    // Function to calculate time until next attack
    const calculateTimeUntilNextAttack = (lastAttackTimestamp: number): { canAttack: boolean; timeUntilNextAttack: string } => {
        if (lastAttackTimestamp === 0) {
            return { canAttack: true, timeUntilNextAttack: "Ready to attack!" }
        }

        const now = Math.floor(Date.now() / 1000) // Current time in seconds
        const timeSinceLastAttack = now - lastAttackTimestamp
        const twentyFourHours = 24 * 60 * 60 // 24 hours in seconds

        if (timeSinceLastAttack >= twentyFourHours) {
            return { canAttack: true, timeUntilNextAttack: "Ready to attack!" }
        }

        const timeRemaining = twentyFourHours - timeSinceLastAttack
        const hours = Math.floor(timeRemaining / 3600)
        const minutes = Math.floor((timeRemaining % 3600) / 60)
        const seconds = timeRemaining % 60

        if (hours > 0) {
            return { canAttack: false, timeUntilNextAttack: `${hours}h ${minutes}m` }
        } else if (minutes > 0) {
            return { canAttack: false, timeUntilNextAttack: `${minutes}m ${seconds}s` }
        } else {
            return { canAttack: false, timeUntilNextAttack: `${seconds}s` }
        }
    }

    // Function to disconnect wallet
    const handleDisconnect = () => {
        // AppKit doesn't have a direct disconnect method, so we'll open the modal
        // Users can disconnect from there
        open()
    }

    // Fetch user's NFTs when connected
    useEffect(() => {
        if (isConnected && address) {
            fetchUserPepes()
        }
    }, [isConnected, address])

    const fetchUserPepes = async () => {
        try {
            setIsLoading(true)
            if (!walletProvider || !address) return

            const ethersProvider = new ethers.BrowserProvider(walletProvider as ethers.Eip1193Provider)
            const contract = new ethers.Contract(pepurgeContractAddress, pepurgeAbi, ethersProvider)
            
            // Get all Transfer events where 'to' is the user's address
            const transferFilter = contract.filters.Transfer(null, address, null)
            const transferEvents = await contract.queryFilter(transferFilter, 0, 'latest')
            
            // Get unique token IDs that were transferred TO the user
            const tokenIds = new Set<string>()
            for (const event of transferEvents) {
                if ('args' in event && event.args) {
                    tokenIds.add(event.args.tokenId.toString())
                }
            }
            
            // Also get Transfer events where 'from' is the user's address to remove tokens they no longer own
            const transferFromFilter = contract.filters.Transfer(address, null, null)
            const transferFromEvents = await contract.queryFilter(transferFromFilter, 0, 'latest')
            
            // Remove tokens that were transferred FROM the user
            for (const event of transferFromEvents) {
                if ('args' in event && event.args) {
                    tokenIds.delete(event.args.tokenId.toString())
                }
            }
            
            const pepes: PepeNFT[] = []
            
            // Now check the remaining tokens to verify current ownership and get data
            for (const tokenId of tokenIds) {
                try {
                    // Double-check current ownership (in case of recent transfers)
                    const currentOwner = await contract.ownerOf(tokenId)
                    
                    if (currentOwner.toLowerCase() === address.toLowerCase()) {
                        const [life, pepeType, timestamp] = await Promise.all([
                            contract.Life(tokenId),
                            contract.pepeType(tokenId),
                            contract.timestamp(tokenId)
                        ])
                        
                        const attackInfo = calculateTimeUntilNextAttack(Number(timestamp))
                        
                        pepes.push({
                            tokenId: tokenId,
                            life: Number(life),
                            pepeType: Number(pepeType),
                            imageUrl: `/pepes/${Number(pepeType)}.avif`,
                            lastAttackTimestamp: Number(timestamp),
                            canAttack: attackInfo.canAttack,
                            timeUntilNextAttack: attackInfo.timeUntilNextAttack
                        })
                    }
                } catch (error) {
                    // Token might be burned or transferred, skip
                    console.log(`Skipping token ${tokenId}:`, error)
                    continue
                }
            }
            
            setUserPepes(pepes)
        } catch (error) {
            console.error("Error fetching user pepes:", error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleAttack = async () => {
        if (!selectedPepe || !targetTokenId || !walletProvider) return
        
        try {
            setIsAttacking(true)
            const ethersProvider = new ethers.BrowserProvider(walletProvider as ethers.Eip1193Provider)
            const signer = await ethersProvider.getSigner()
            const contract = new ethers.Contract(pepurgeContractAddress, pepurgeAbi, signer)
            
            const tx = await contract.Attack(selectedPepe.tokenId, targetTokenId)
            await tx.wait()
            
            // Success! Show success modal
            setAttackResult({
                success: true,
                message: "ATTACK SUCCESSFUL!",
                attackerTokenId: selectedPepe.tokenId,
                targetTokenId: targetTokenId
            })
            setShowResultModal(true)
            
            // Refresh user's pepes after attack
            await fetchUserPepes()
            setShowAttackModal(false)
            setTargetTokenId("")
            setSelectedPepe(null)
        } catch (error: any) {
            console.error("Attack failed:", error)
            
            // Show failure modal with error details
            let errorMessage = "Attack failed!"
            if (error.reason) {
                errorMessage = error.reason
            } else if (error.message?.includes("insufficient funds")) {
                errorMessage = "Insufficient funds for transaction"
            } else if (error.message?.includes("already attacked")) {
                errorMessage = "You can only attack once per day"
            } else if (error.code === "ACTION_REJECTED") {
                errorMessage = "Transaction was rejected"
            }
            
            setAttackResult({
                success: false,
                message: errorMessage,
                attackerTokenId: selectedPepe.tokenId,
                targetTokenId: targetTokenId
            })
            setShowResultModal(true)
            setShowAttackModal(false)
            setTargetTokenId("")
            setSelectedPepe(null)
        } finally {
            setIsAttacking(false)
        }
    }

    const openAttackModal = (pepe: PepeNFT) => {
        setSelectedPepe(pepe)
        setShowAttackModal(true)
    }

    if (!isConnected) {
        return (
            <div className="min-h-screen bg-yellow-400 flex items-center justify-center p-4">
                <div className="text-center">
                    <div className="bg-black h-8 w-full mb-8"></div>
                    <h1 className="text-8xl md:text-[12rem] font-bold text-black mb-8 font-kill-bill tracking-wider">
                        KILL PEPE
                    </h1>
                    <div className="bg-black h-8 w-full mb-8"></div>
                    <p className="text-2xl md:text-4xl text-black font-bold mb-8 font-kill-bill">
                        BATTLE TO SURVIVE
                    </p>
                    <Button 
                        onClick={() => open()}
                        className="bg-black text-yellow-400 hover:bg-gray-800 border-4 border-black text-2xl font-bold py-6 px-12 font-kill-bill"
                    >
                        CONNECT WALLET
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-yellow-400 p-4 relative">
            {/* Wallet Indicator - Hidden on mobile */}
            {isConnected && address && (
                <div className="absolute top-4 right-4 z-10 hidden md:block">
                    <Button
                        onClick={handleDisconnect}
                        className="bg-black text-yellow-400 hover:bg-gray-800 border-2 border-black font-kill-bill px-4 py-2 text-sm"
                    >
                        <span className="mr-2">{truncateAddress(address)}</span>
                        <LogOut className="w-4 h-4" />
                    </Button>
                </div>
            )}

            {/* Header */}
            <div className="text-center mb-8">
                <div className="max-w-4xl mx-auto">
                    <div className="bg-black h-6 w-full mb-6"></div>
                    <h1 className="text-6xl md:text-8xl font-bold text-black mb-4 font-kill-bill tracking-wider">
                        KILL PEPE
                    </h1>
                    <div className="bg-black h-6 w-full mb-6"></div>
                    <p className="text-xl md:text-2xl text-black font-bold font-kill-bill">
                        ATTACK ONCE PER DAY • SURVIVE OR BURN
                    </p>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-6xl mx-auto">
                {isLoading ? (
                    <div className="text-center">
                        <div className="text-4xl font-bold text-black font-kill-bill">LOADING PEPES...</div>
                    </div>
                ) : userPepes.length === 0 ? (
                    <div className="text-center">
                        <div className="text-4xl font-bold text-black font-kill-bill mb-4">NO PEPES FOUND</div>
                        <p className="text-xl text-black font-kill-bill">You need to own some Pepe NFTs to play</p>
                    </div>
                ) : (
                    <>
                        <div className="text-center mb-6">
                            <p className="text-2xl font-bold text-black font-kill-bill">YOUR PEPES ({userPepes.length})</p>
                        </div>
                        
                        {/* Pepe Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {userPepes.map((pepe) => (
                                <div
                                    key={pepe.tokenId}
                                    className={`bg-black border-4 border-black p-4 cursor-pointer hover:border-red-600 transition-all duration-200 ${
                                        pepe.life === 0 ? 'opacity-50' : ''
                                    }`}
                                    onClick={() => pepe.life > 0 && pepe.canAttack && openAttackModal(pepe)}
                                >
                                    <div className="aspect-square mb-4 overflow-hidden">
                                        <img 
                                            src={pepe.imageUrl}
                                            alt={`Pepe #${pepe.tokenId}`}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = '/pepes/1.avif'
                                            }}
                                        />
                                    </div>
                                    
                                    <div className="text-center space-y-2">
                                        <div className="text-yellow-400 font-bold text-xl font-kill-bill">
                                            PEPE #{pepe.tokenId}
                                        </div>
                                        
                                        <div className="flex items-center justify-center space-x-2">
                                            {pepe.life > 0 ? (
                                                <>
                                                    <Heart className="text-red-500 w-6 h-6" />
                                                    <span className="text-yellow-400 font-bold text-xl font-kill-bill">
                                                        {pepe.life}
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    <Skull className="text-gray-500 w-6 h-6" />
                                                    <span className="text-gray-500 font-bold text-xl font-kill-bill">
                                                        DEAD
                                                    </span>
                                                </>
                                            )}
                                        </div>

                                        {/* Attack Timer */}
                                        {pepe.life > 0 && (
                                            <div className="flex items-center justify-center space-x-1">
                                                <Clock className={`w-4 h-4 ${pepe.canAttack ? 'text-green-500' : 'text-orange-500'}`} />
                                                <span className={`text-sm font-kill-bill ${pepe.canAttack ? 'text-green-500' : 'text-orange-500'}`}>
                                                    {pepe.timeUntilNextAttack}
                                                </span>
                                            </div>
                                        )}
                                        
                                        {pepe.life > 0 && (
                                            <div className="pt-2">
                                                <Button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        openAttackModal(pepe)
                                                    }}
                                                    disabled={!pepe.canAttack}
                                                    className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 font-kill-bill border-2 border-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <Sword className="w-4 h-4 mr-2" />
                                                    {pepe.canAttack ? "ATTACK" : "COOLDOWN"}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Attack Modal */}
            <Dialog open={showAttackModal} onOpenChange={setShowAttackModal}>
                <DialogContent className="bg-yellow-400 border-4 border-black max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-3xl font-bold text-black text-center font-kill-bill">
                            ATTACK TARGET
                        </DialogTitle>
                    </DialogHeader>
                    
                    {selectedPepe && (
                        <div className="space-y-6">
                            {/* Selected Pepe */}
                            <div className="text-center">
                                <div className="w-32 h-32 mx-auto mb-4 border-2 border-black">
                                    <img 
                                        src={selectedPepe.imageUrl}
                                        alt={`Pepe #${selectedPepe.tokenId}`}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <div className="text-black font-bold text-xl font-kill-bill">
                                    PEPE #{selectedPepe.tokenId}
                                </div>
                                <div className="flex items-center justify-center space-x-2 mt-2">
                                    <Heart className="text-red-500 w-6 h-6" />
                                    <span className="text-black font-bold text-xl font-kill-bill">
                                        {selectedPepe.life}
                                    </span>
                                </div>
                            </div>

                            {/* Target Input */}
                            <div className="space-y-2">
                                <Label className="text-black font-bold text-lg font-kill-bill">
                                    TARGET TOKEN ID:
                                </Label>
                                <Input
                                    type="number"
                                    value={targetTokenId}
                                    onChange={(e) => setTargetTokenId(e.target.value)}
                                    placeholder="Enter token ID to attack"
                                    className="bg-white border-2 border-black text-black font-kill-bill text-lg"
                                />
                            </div>

                            {/* Action Buttons */}
                            <div className="flex space-x-4">
                                <Button
                                    onClick={() => setShowAttackModal(false)}
                                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 font-kill-bill border-2 border-black"
                                >
                                    <X className="w-4 h-4 mr-2" />
                                    CANCEL
                                </Button>
                                <Button
                                    onClick={handleAttack}
                                    disabled={!targetTokenId || isAttacking}
                                    className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 font-kill-bill border-2 border-black disabled:opacity-50"
                                >
                                    <Sword className="w-4 h-4 mr-2" />
                                    {isAttacking ? "ATTACKING..." : "ATTACK"}
                                </Button>
                            </div>

                            {/* Rules */}
                            <div className="bg-black border-2 border-black p-4">
                                <div className="text-yellow-400 font-kill-bill text-sm space-y-1">
                                    <p>• YOU CAN ATTACK ONCE PER DAY</p>
                                    <p>• ATTACKING GIVES YOU +1 LIFE</p>
                                    <p>• BEING ATTACKED GIVES YOU -1 LIFE</p>
                                    <p>• AT 0 LIFE YOUR NFT IS BURNT</p>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Attack Result Modal */}
            <Dialog open={showResultModal} onOpenChange={setShowResultModal}>
                <DialogContent className="bg-yellow-400 border-4 border-black max-w-md">
                    <DialogHeader>
                        <DialogTitle className={`text-3xl font-bold text-center font-kill-bill ${
                            attackResult?.success ? 'text-black' : 'text-red-600'
                        }`}>
                            {attackResult?.success ? '🗡️ SUCCESS! 🗡️' : '❌ FAILED! ❌'}
                        </DialogTitle>
                    </DialogHeader>
                    
                    {attackResult && (
                        <div className="space-y-6 text-center">
                            <div className="text-black font-kill-bill text-lg">
                                {attackResult.message}
                            </div>
                            
                            {attackResult.success ? (
                                <div className="space-y-3">
                                    <div className="text-black font-bold font-kill-bill">
                                        Pepe #{attackResult.attackerTokenId} attacked Pepe #{attackResult.targetTokenId}!
                                    </div>
                                    <div className="bg-black border-2 border-black p-4">
                                        <div className="text-yellow-400 font-kill-bill text-sm space-y-1">
                                            <p>❤️ You gained +1 life!</p>
                                            <p>💀 Target lost -1 life!</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="text-black font-bold font-kill-bill">
                                        Attack from Pepe #{attackResult.attackerTokenId} to Pepe #{attackResult.targetTokenId} failed
                                    </div>
                                    <div className="bg-black border-2 border-black p-4">
                                        <div className="text-yellow-400 font-kill-bill text-sm">
                                            <p>Make sure you can attack today and the target token ID is valid.</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            <Button
                                onClick={() => setShowResultModal(false)}
                                className="w-full bg-black text-yellow-400 hover:bg-gray-800 font-bold py-3 font-kill-bill border-2 border-black"
                            >
                                OK
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
