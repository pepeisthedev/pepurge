"use client"

import { useState, useEffect } from "react"
import { useAppKit, useAppKitAccount, useAppKitProvider } from "@reown/appkit/react"
import { ethers } from "ethers"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { 
    Skull, 
    Sword, 
    Shield, 
    Heart, 
    Eye, 
    EyeOff, 
    Clock, 
    LogOut, 
    Zap,
    Ghost
} from "lucide-react"
import pepurgeAbi from "../assets/abis/pepurge.json"

const pepurgeContractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;

interface PepurgeNFT {
    tokenId: string
    type: number
    hp: number
    maxHp: number
    attack: number
    defense: number
    isHidden: boolean
    lastActionTimestamp: number
    canAct: boolean
    timeUntilNextAction: string
    imageUrl: string
}

interface TargetPepurge {
    tokenId: string
    type: number
    hp: number
    maxHp: number
    attack: number
    defense: number
    lastActionTimestamp: number
    imageUrl: string
}

export default function NightmarePage() {
    const { open } = useAppKit()
    const { isConnected, address } = useAppKitAccount()
    const { walletProvider } = useAppKitProvider("eip155")

    const [userPepurges, setUserPepurges] = useState<PepurgeNFT[]>([])
    const [availableTargets, setAvailableTargets] = useState<TargetPepurge[]>([])
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const [showActionModal, setShowActionModal] = useState<boolean>(false)
    const [selectedPepurge, setSelectedPepurge] = useState<PepurgeNFT | null>(null)
    const [actionType, setActionType] = useState<"attack" | "hide">("attack")
    const [targetTokenId, setTargetTokenId] = useState<string>("")
    const [currentTargetPage, setCurrentTargetPage] = useState<number>(0)
    const [randomizedTargets, setRandomizedTargets] = useState<TargetPepurge[]>([])
    const targetsPerPage = 8
    const [isPerformingAction, setIsPerformingAction] = useState<boolean>(false)
    const [showResultModal, setShowResultModal] = useState<boolean>(false)
    const [actionResult, setActionResult] = useState<{
        success: boolean
        message: string
        type: "attack" | "hide"
        pepurgeTokenId?: string
        targetTokenId?: string
        hideSucceeded?: boolean
    } | null>(null)

    // Function to truncate wallet address
    const truncateAddress = (address: string) => {
        return `${address.slice(0, 6)}...${address.slice(-4)}`
    }

    // Function to calculate time until next action (24 hour cooldown)
    const calculateTimeUntilNextAction = (lastActionTimestamp: number): { canAct: boolean; timeUntilNextAction: string } => {
        if (lastActionTimestamp === 0) {
            return { canAct: true, timeUntilNextAction: "Ready" }
        }

        const now = Math.floor(Date.now() / 1000)
        const timeSinceLastAction = now - lastActionTimestamp
        const twentyFourHours = 24 * 60 * 60

        if (timeSinceLastAction >= twentyFourHours) {
            return { canAct: true, timeUntilNextAction: "Ready" }
        }

        const timeRemaining = twentyFourHours - timeSinceLastAction
        const hours = Math.floor(timeRemaining / 3600)
        const minutes = Math.floor((timeRemaining % 3600) / 60)

        if (hours > 0) {
            return { canAct: false, timeUntilNextAction: `${hours}h ${minutes}m` }
        } else {
            return { canAct: false, timeUntilNextAction: `${minutes}m` }
        }
    }

    // Function to disconnect wallet
    const handleDisconnect = () => {
        open()
    }

    // Fetch user's Pepurges and available targets
    useEffect(() => {
        if (isConnected && address) {
            fetchUserPepurges()
        }
    }, [isConnected, address])

    // Fetch available targets after user pepurges are loaded
    useEffect(() => {
        if (isConnected && address && walletProvider) {
            fetchAvailableTargets()
        }
    }, [userPepurges, isConnected, address, walletProvider])

    const fetchUserPepurges = async () => {
        try {
            setIsLoading(true)
            if (!walletProvider || !address) return

            const ethersProvider = new ethers.BrowserProvider(walletProvider as ethers.Eip1193Provider)
            const contract = new ethers.Contract(pepurgeContractAddress, pepurgeAbi, ethersProvider)
            
            const result = await contract.getOwnedPepurges(address)
            const [tokenIds, types, hps, hiddenStatus, timestamps, attacks, defenses, maxHps] = result
            
            const pepurges: PepurgeNFT[] = []
            
            for (let i = 0; i < tokenIds.length; i++) {
                const actionInfo = calculateTimeUntilNextAction(Number(timestamps[i]))
                
                pepurges.push({
                    tokenId: tokenIds[i].toString(),
                    type: Number(types[i]),
                    hp: Number(hps[i]),
                    maxHp: Number(maxHps[i]),
                    attack: Number(attacks[i]),
                    defense: Number(defenses[i]),
                    isHidden: hiddenStatus[i],
                    lastActionTimestamp: Number(timestamps[i]),
                    canAct: actionInfo.canAct,
                    timeUntilNextAction: actionInfo.timeUntilNextAction,
                    imageUrl: `/pepes/${Number(types[i])}.png`
                })
            }
            
            setUserPepurges(pepurges)
        } catch (error) {
            console.error("Error fetching user pepurges:", error)
        } finally {
            setIsLoading(false)
        }
    }

    const fetchAvailableTargets = async () => {
        try {
            if (!walletProvider) return

            const ethersProvider = new ethers.BrowserProvider(walletProvider as ethers.Eip1193Provider)
            const contract = new ethers.Contract(pepurgeContractAddress, pepurgeAbi, ethersProvider)
            
            const result = await contract.aliveAndNotHiddenPepes()
            const [tokenIds, types, hps, timestamps, attacks, defenses, maxHps] = result

            const targets: TargetPepurge[] = []
            const userTokenIds = userPepurges.map(p => p.tokenId)
            
            for (let i = 0; i < tokenIds.length; i++) {
                const tokenId = tokenIds[i].toString()
                
                // Filter out tokens owned by the current user
                if (!userTokenIds.includes(tokenId)) {
                    targets.push({
                        tokenId: tokenId,
                        type: Number(types[i]),
                        hp: Number(hps[i]),
                        maxHp: Number(maxHps[i]),
                        attack: Number(attacks[i]),
                        defense: Number(defenses[i]),
                        lastActionTimestamp: Number(timestamps[i]),
                        imageUrl: `/pepes/${Number(types[i])}.png`
                    })
                }
            }
            
            setAvailableTargets(targets)
            
            // Randomize targets for pagination
            const shuffled = [...targets].sort(() => Math.random() - 0.5)
            setRandomizedTargets(shuffled)
        } catch (error) {
            console.error("Error fetching available targets:", error)
        }
    }

    const handleAction = async () => {
        if (!selectedPepurge || !walletProvider) return
        if (actionType === "attack" && !targetTokenId) return
        
        try {
            setIsPerformingAction(true)
            const ethersProvider = new ethers.BrowserProvider(walletProvider as ethers.Eip1193Provider)
            const signer = await ethersProvider.getSigner()
            const contract = new ethers.Contract(pepurgeContractAddress, pepurgeAbi, signer)
            
            let tx
            let resultMessage = ""
            let hideSucceeded = false
            
            if (actionType === "attack") {
                tx = await contract.Attack(selectedPepurge.tokenId, targetTokenId)
                resultMessage = "BLOOD SPILLED!"
            } else {
                tx = await contract.Hide(selectedPepurge.tokenId)
            }
            
            const receipt = await tx.wait()
            
            // For hide action, parse the HideAttempt event to check if it succeeded
            if (actionType === "hide") {
                receipt.logs.forEach((log: any) => {
                    try {
                        const parsedLog = contract.interface.parseLog(log)
                        if (parsedLog?.name === "HideAttempt") {
                            const tokenId = Number(parsedLog.args[0])
                            const sender = parsedLog.args[1]
                            hideSucceeded = parsedLog.args[2] // The success boolean
                            
                            console.log("HideAttempt event:", {
                                tokenId,
                                sender,
                                succeeded: hideSucceeded
                            })
                        }
                    } catch (e) {
                        console.log("Unparsed log:", log)
                    }
                })
                
                resultMessage = hideSucceeded ? "VANISHED INTO SHADOWS!" : "FAILED TO HIDE!"
            }
            
            setActionResult({
                success: true,
                message: resultMessage,
                type: actionType,
                pepurgeTokenId: selectedPepurge.tokenId,
                targetTokenId: targetTokenId,
                hideSucceeded: actionType === "hide" ? hideSucceeded : undefined
            })
            setShowResultModal(true)
            
            // Refresh data after action
            await fetchUserPepurges()
            // fetchAvailableTargets will be called automatically via useEffect when userPepurges updates
            
            setShowActionModal(false)
            setTargetTokenId("")
            setSelectedPepurge(null)
        } catch (error: any) {
            console.error("Action failed:", error)
            
            let errorMessage = "ACTION FAILED!"
            if (error.reason) {
                errorMessage = error.reason
            } else if (error.message?.includes("insufficient funds")) {
                errorMessage = "INSUFFICIENT FUNDS FOR RITUAL"
            } else if (error.code === "ACTION_REJECTED") {
                errorMessage = "RITUAL REJECTED"
            }
            
            setActionResult({
                success: false,
                message: errorMessage,
                type: actionType,
                pepurgeTokenId: selectedPepurge.tokenId,
                targetTokenId: targetTokenId
            })
            setShowResultModal(true)
            setShowActionModal(false)
            setTargetTokenId("")
            setSelectedPepurge(null)
        } finally {
            setIsPerformingAction(false)
        }
    }

    const openActionModal = (pepurge: PepurgeNFT, action: "attack" | "hide") => {
        setSelectedPepurge(pepurge)
        setActionType(action)
        setTargetTokenId("")
        setCurrentTargetPage(0)
        setShowActionModal(true)
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
                    <p className="text-2xl md:text-3xl text-black font-nosifer mb-8 opacity-90">
                        ENTER THE DARKNESS
                    </p>
                    <Button 
                        onClick={() => open()}
                        className="bg-black text-[#b31c1e] hover:bg-red-900 hover:text-white border-4 border-black text-2xl font-nosifer py-6 px-12 shadow-2xl transform hover:scale-105 transition-all"
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
                    <p className="text-xl md:text-2xl text-black font-nosifer opacity-90">
                        PURGE OR BE PURGED
                    </p>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto">
                {isLoading ? (
                    <div className="text-center">
                        <Skull className="w-16 h-16 mx-auto animate-spin text-black mb-4" />
                        <div className="text-4xl font-nosifer text-black">SUMMONING PEPURGES...</div>
                    </div>
                ) : userPepurges.length === 0 ? (
                    <div className="text-center">
                        <img 
                            src="/C1.png" 
                            alt="No Pepurge" 
                            className="w-24 mx-auto mb-4"
                        />
                        <div className="text-4xl font-nosifer text-black mb-4">NO PEPURGE IN YOUR POSSESSION</div>
                    </div>
                ) : (
                    <>
                        <div className="text-center mb-8">
                            <p className="text-3xl font-nosifer text-black flex items-center justify-center">
                                YOUR ARMY ({userPepurges.length})
                            </p>
                        </div>
                        
                        {/* Pepurge Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-3 md:gap-6">
                            {userPepurges.map((pepurge) => (
                                <div
                                    key={pepurge.tokenId}
                                    className={`bg-black border-2 md:border-4 border-red-800 p-3 md:p-6 rounded-lg shadow-2xl transform transition-all duration-300 ${
                                        pepurge.hp === 0 ? 'opacity-50 grayscale' : 'hover:border-red-400'
                                    } ${pepurge.isHidden ? 'border-purple-600' : ''}`}
                                >
                                    <div className="aspect-square mb-2 md:mb-4 overflow-hidden rounded-lg border-2 border-red-600">
                                        <img 
                                            src={pepurge.imageUrl}
                                            alt={`Pepurge #${pepurge.tokenId}`}
                                            className={`w-full h-full object-cover`}
                                        />
                                    </div>
                                    
                                    <div className="text-center space-y-1 md:space-y-3">
                                        <div className="text-[#b31c1e] font-nosifer text-sm md:text-xl flex items-center justify-center">
                                            <span className="hidden md:inline">PEPURGE </span>#{pepurge.tokenId}
                                        </div>

                                        {/* Status */}
                                        {pepurge.isHidden ? (
                                            <div className="flex items-center justify-center space-x-1 md:space-x-2 bg-purple-900 py-1 md:py-2 px-2 md:px-4 rounded">
                                                <EyeOff className="text-purple-300 w-3 h-3 md:w-5 md:h-5" />
                                                <span className="text-purple-300 font-nosifer text-xs md:text-sm">HIDDEN</span>
                                            </div>
                                        ) : pepurge.hp === 0 ? (
                                            <div className="flex items-center justify-center space-x-1 md:space-x-2 bg-gray-800 py-1 md:py-2 px-2 md:px-4 rounded">
                                                <Skull className="text-gray-400 w-3 h-3 md:w-5 md:h-5" />
                                                <span className="text-gray-400 font-nosifer text-xs md:text-sm">DEAD</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center space-x-1 md:space-x-2 bg-red-900 py-1 md:py-2 px-2 md:px-4 rounded">
                                                <Eye className="text-red-300 w-3 h-3 md:w-5 md:h-5" />
                                                <span className="text-red-300 font-nosifer text-xs md:text-sm">EXPOSED</span>
                                            </div>
                                        )}
                                        
                                        {/* Stats */}
                                        <div className="grid grid-cols-3 gap-1 md:gap-2 text-xs md:text-sm">
                                            <div className="bg-red-900 p-1 md:p-2 rounded text-center">
                                                <Heart className="w-3 h-3 md:w-4 md:h-4 mx-auto mb-0.5 md:mb-1 text-red-400" />
                                                <div className="text-red-200 text-[8px] md:text-xs">{pepurge.hp}/{pepurge.maxHp}</div>
                                                <div className="text-red-400 text-[8px] md:text-xs hidden md:block">HP</div>
                                            </div>
                                            <div className="bg-orange-900 p-1 md:p-2 rounded text-center">
                                                <Sword className="w-3 h-3 md:w-4 md:h-4 mx-auto mb-0.5 md:mb-1 text-orange-400" />
                                                <div className="text-orange-200 text-[8px] md:text-xs">{pepurge.attack}</div>
                                                <div className="text-orange-400 text-[8px] md:text-xs hidden md:block">ATK</div>
                                            </div>
                                            <div className="bg-blue-900 p-1 md:p-2 rounded text-center">
                                                <Shield className="w-3 h-3 md:w-4 md:h-4 mx-auto mb-0.5 md:mb-1 text-blue-400" />
                                                <div className="text-blue-200 text-[8px] md:text-xs">{pepurge.defense}</div>
                                                <div className="text-blue-400 text-[8px] md:text-xs hidden md:block">DEF</div>
                                            </div>
                                        </div>

                                        {/* Cooldown */}
                                        <div className="flex items-center justify-center space-x-1 md:space-x-2 bg-gray-900 py-1 md:py-2 px-2 md:px-4 rounded">
                                            <Clock className={`w-3 h-3 md:w-4 md:h-4 ${pepurge.canAct ? 'text-green-400' : 'text-orange-400'}`} />
                                            <span className={`text-xs md:text-sm font-nosifer ${pepurge.canAct ? 'text-green-400' : 'text-orange-400'}`}>
                                                {pepurge.timeUntilNextAction}
                                            </span>
                                        </div>
                                        
                                        {/* Action Buttons */}
                                        {pepurge.hp > 0 && (
                                            <div className="flex flex-col md:flex-row space-y-1 md:space-y-0 md:space-x-2 pt-1 md:pt-2">
                                                <Button
                                                    onClick={() => openActionModal(pepurge, "attack")}
                                                    disabled={pepurge.isHidden || !pepurge.canAct}
                                                    className={`flex-1 py-1 md:py-2 px-2 md:px-3 border-2 text-xs md:text-sm font-nosifer ${
                                                        pepurge.isHidden || !pepurge.canAct 
                                                            ? 'bg-gray-500 hover:bg-gray-500 text-gray-300 border-gray-400 cursor-not-allowed' 
                                                            : 'bg-red-600 hover:bg-red-700 text-white border-red-400'
                                                    }`}
                                                >
                                                    <Sword className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                                                    ATTACK
                                                </Button>
                                                <Button
                                                    onClick={() => openActionModal(pepurge, "hide")}
                                                    disabled={!pepurge.canAct}
                                                    className={`flex-1 py-1 md:py-2 px-2 md:px-3 border-2 text-xs md:text-sm font-nosifer ${
                                                        !pepurge.canAct 
                                                            ? 'bg-gray-500 hover:bg-gray-500 text-gray-300 border-gray-400 cursor-not-allowed' 
                                                            : 'bg-purple-600 hover:bg-purple-700 text-white border-purple-400'
                                                    }`}
                                                >
                                                    <Ghost className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                                                    HIDE
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

            {/* Action Modal */}
            <Dialog open={showActionModal} onOpenChange={setShowActionModal}>
                <DialogContent className="bg-[#b31c1e] border-4 border-black max-w-md max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-3xl font-nosifer text-black text-center">
                            {actionType === "attack" ? "🗡️ SPILL BLOOD" : "HIDE"}
                        </DialogTitle>
                    </DialogHeader>
                    
                    {selectedPepurge && (
                        <div className="space-y-6">
                            {/* Selected Pepurge */}
                            <div className="text-center">
                                <div className="w-32 h-32 mx-auto mb-4 border-2 border-black rounded-lg overflow-hidden">
                                    <img 
                                        src={selectedPepurge.imageUrl}
                                        alt={`Pepurge #${selectedPepurge.tokenId}`}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <div className="text-black font-nosifer text-xl">
                                    PEPURGE #{selectedPepurge.tokenId}
                                </div>
                                <div className="flex items-center justify-center space-x-4 mt-2 text-sm">
                                    <div className="flex items-center space-x-1">
                                        <Heart className="text-red-600 w-4 h-4" />
                                        <span className="text-black font-nosifer">{selectedPepurge.hp}</span>
                                    </div>
                                    <div className="flex items-center space-x-1">
                                        <Sword className="text-orange-600 w-4 h-4" />
                                        <span className="text-black font-nosifer">{selectedPepurge.attack}</span>
                                    </div>
                                    <div className="flex items-center space-x-1">
                                        <Shield className="text-blue-600 w-4 h-4" />
                                        <span className="text-black font-nosifer">{selectedPepurge.defense}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Target Selection for Attack */}
                            {actionType === "attack" && (
                                <div className="space-y-3">
                                    <Label className="text-black font-nosifer text-lg">
                                        SELECT VICTIM:
                                    </Label>
                                    
                                    {/* Selected Target Display */}
                                    {targetTokenId && (
                                        <div className="bg-gray-100 border-2 border-black p-3 rounded">
                                            {(() => {
                                                const selectedTarget = availableTargets.find(t => t.tokenId === targetTokenId)
                                                return selectedTarget ? (
                                                    <div className="flex items-center space-x-3">
                                                        <img 
                                                            src={selectedTarget.imageUrl} 
                                                            alt={`Pepurge #${selectedTarget.tokenId}`}
                                                            className="w-12 h-12 rounded border border-gray-400"
                                                        />
                                                        <div className="flex-1">
                                                            <div className="font-nosifer text-black text-lg">SELECTED: #{selectedTarget.tokenId}</div>
                                                            <div className="text-sm flex items-center space-x-3">
                                                                <span className="text-red-600">❤️ {selectedTarget.hp}/{selectedTarget.maxHp}</span>
                                                                <span className="text-blue-600">🛡️ {selectedTarget.defense}</span>
                                                                <span className="text-orange-600">⚔️ {selectedTarget.attack}</span>
                                                            </div>
                                                        </div>
                                                        <Button
                                                            onClick={() => setTargetTokenId("")}
                                                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 text-sm font-nosifer"
                                                        >
                                                            CHANGE
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="text-red-600 font-nosifer">Invalid target selected</div>
                                                )
                                            })()}
                                        </div>
                                    )}

                                    {/* Target Grid */}
                                    {!targetTokenId && (
                                        <div className="space-y-3">
                                            {(() => {
                                                const filteredTargets = randomizedTargets.filter(target => target.tokenId !== selectedPepurge.tokenId)
                                                const startIndex = currentTargetPage * targetsPerPage
                                                const endIndex = startIndex + targetsPerPage
                                                const currentTargets = filteredTargets.slice(startIndex, endIndex)
                                                const totalPages = Math.ceil(filteredTargets.length / targetsPerPage)

                                                return (
                                                    <>
                                                        {filteredTargets.length === 0 ? (
                                                            <div className="p-6 text-center text-gray-500 font-nosifer bg-gray-100 rounded border-2 border-gray-300">
                                                                No targets available
                                                            </div>
                                                        ) : (
                                                            <>
                                                                {/* Target Grid */}
                                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-white border-2 border-black p-3 rounded max-h-60 overflow-y-auto">
                                                                    {currentTargets.map((target) => (
                                                                        <div
                                                                            key={target.tokenId}
                                                                            onClick={() => setTargetTokenId(target.tokenId)}
                                                                            className="bg-gray-50 hover:bg-gray-200 border-2 border-gray-300 hover:border-red-400 p-2 rounded cursor-pointer transition-all"
                                                                        >
                                                                            <div className="text-center space-y-1">
                                                                                <img 
                                                                                    src={target.imageUrl} 
                                                                                    alt={`Pepurge #${target.tokenId}`}
                                                                                    className="w-10 h-10 mx-auto rounded border border-gray-400"
                                                                                />
                                                                                <div className="font-nosifer text-black text-xs">#{target.tokenId}</div>
                                                                                <div className="grid grid-cols-3 gap-1 text-[10px]">
                                                                                    <div className="text-center">
                                                                                        <div className="text-red-600 font-bold">{target.hp}</div>
                                                                                        <div className="text-red-500 text-[8px]">HP</div>
                                                                                    </div>
                                                                                    <div className="text-center">
                                                                                        <div className="text-orange-600 font-bold">{target.attack}</div>
                                                                                        <div className="text-orange-500 text-[8px]">ATK</div>
                                                                                    </div>
                                                                                    <div className="text-center">
                                                                                        <div className="text-blue-600 font-bold">{target.defense}</div>
                                                                                        <div className="text-blue-500 text-[8px]">DEF</div>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>

                                                                {/* Pagination */}
                                                                {totalPages > 1 && (
                                                                    <div className="flex items-center justify-between bg-gray-100 border-2 border-gray-300 p-2 rounded">
                                                                        <Button
                                                                            onClick={() => setCurrentTargetPage(Math.max(0, currentTargetPage - 1))}
                                                                            disabled={currentTargetPage === 0}
                                                                            className="bg-gray-600 hover:bg-gray-700 text-white px-2 py-1 text-xs font-nosifer disabled:opacity-50"
                                                                        >
                                                                            PREV
                                                                        </Button>
                                                                        <span className="font-nosifer text-black text-xs">
                                                                            PAGE {currentTargetPage + 1} OF {totalPages}
                                                                        </span>
                                                                        <Button
                                                                            onClick={() => setCurrentTargetPage(Math.min(totalPages - 1, currentTargetPage + 1))}
                                                                            disabled={currentTargetPage >= totalPages - 1}
                                                                            className="bg-gray-600 hover:bg-gray-700 text-white px-2 py-1 text-xs font-nosifer disabled:opacity-50"
                                                                        >
                                                                            NEXT
                                                                        </Button>
                                                                    </div>
                                                                )}

                                                             
                                                            </>
                                                        )}
                                                    </>
                                                )
                                            })()}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex space-x-4">
                                <Button
                                    onClick={() => setShowActionModal(false)}
                                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-nosifer py-3 border-2 border-black"
                                >
                                    CLOSE
                                </Button>
                                <Button
                                    onClick={handleAction}
                                    disabled={(actionType === "attack" && !targetTokenId) || isPerformingAction}
                                    className="flex-1 bg-red-600 hover:bg-red-700 text-white font-nosifer py-3 border-2 border-black disabled:opacity-50"
                                >
                                    {isPerformingAction ? (
                                        <>
                                            <Zap className="w-4 h-4 mr-2 animate-spin" />
                                            CASTING...
                                        </>
                                    ) : actionType === "attack" ? (
                                        <>
                                            <Sword className="w-4 h-4 mr-2" />
                                            ATTACK
                                        </>
                                    ) : (
                                        <>
                                            <Ghost className="w-4 h-4 mr-2" />
                                            HIDE
                                        </>
                                    )}
                                </Button>
                            </div>

                            {/* Rules - Only show when target is selected or for hide action */}
                            {(actionType === "hide" || (actionType === "attack" && targetTokenId)) && (
                                <div className="bg-black border-2 border-red-800 p-4 rounded">
                                    <div className="text-[#b31c1e] text-sm space-y-1 font-nosifer">
                                        {actionType === "attack" ? (
                                            <>
                                                <p>• DEAL DAMAGE BASED ON YOUR ATTACK</p>
                                                <p>• VICTIMS TAKE DAMAGE BASED ON DEFENSE</p>
                                            </>
                                        ) : (
                                            <>
                                                <p>• 50% CHANCE TO HIDE</p>
                                                <p>• HIDDEN PEPURGES HEAL TO FULL HP</p>
                                                <p>• HIDDEN PEPURGES CANNOT BE ATTACKED</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Result Modal */}
            <Dialog open={showResultModal} onOpenChange={setShowResultModal}>
                <DialogContent className="bg-[#b31c1e] border-4 border-black max-w-md">
                    <DialogHeader>
                        <DialogTitle className={`text-3xl font-nosifer text-center ${
                            actionResult?.success ? 'text-black' : 'text-red-900'
                        }`}>
                            {actionResult?.success ? '🩸 SUCCESS! 🩸' : '💀 FAILED! 💀'}
                        </DialogTitle>
                    </DialogHeader>
                    
                    {actionResult && (
                        <div className="space-y-6 text-center">
                            <div className="text-black font-nosifer text-lg">
                                {actionResult.message}
                            </div>
                            
                            {actionResult.success ? (
                                <div className="space-y-3">
                                    <div className="text-black font-nosifer">
                                        {actionResult.type === "attack" 
                                            ? `Pepurge #${actionResult.pepurgeTokenId} attacked Pepurge #${actionResult.targetTokenId}!`
                                            : ``
                                        }
                                    </div>
                                    <div className="bg-black border-2 border-red-800 p-4 rounded">
                                        <div className="text-[#b31c1e] text-sm space-y-1">
                                            {actionResult.type === "attack" ? (
                                                <>
                                                    <p>🗡️ Damage dealt to victim!</p>
                                                    <p>🩸 Blood has been spilled!</p>
                                                </>
                                            ) : actionResult.hideSucceeded ? (
                                                <>
                                                    <p>👻 Successfully vanished!</p>
                                                    <p>❤️ Healing to full health!</p>
                                                </>
                                            ) : (
                                                <>
                                                    <p>💀 Failed to disappear!</p>
                                                    <p>🎯 You remain visible and vulnerable!</p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="text-black font-nosifer">
                                        The ritual has failed...
                                    </div>
                                    <div className="bg-black border-2 border-red-800 p-4 rounded">
                                        <div className="text-[#b31c1e] text-sm">
                                            <p>The darkness rejected your offering. Try again when the stars align.</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            <Button
                                onClick={() => setShowResultModal(false)}
                                className="w-full bg-black text-[#b31c1e] hover:bg-gray-800 font-nosifer py-3 border-2 border-black"
                            >
                                RETURN TO DARKNESS
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
