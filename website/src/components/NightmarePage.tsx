"use client"

import { useState, useEffect } from "react"
import { useAppKit, useAppKitAccount, useAppKitProvider } from "@reown/appkit/react"
import { ethers } from "ethers"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
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
import pepurgeAbi from "../assets/abis/Pepurge.json"

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
    const [searchTokenId, setSearchTokenId] = useState<string>("")
    const targetsPerPage = 8
    const [isPerformingAction, setIsPerformingAction] = useState<boolean>(false)
    const [showResultModal, setShowResultModal] = useState<boolean>(false)
    const [mintPrice, setMintPrice] = useState<string>("0.0")
    const [actionResult, setActionResult] = useState<{
        success: boolean
        message: string
        type: "attack" | "hide"
        pepurgeTokenId?: string
        targetTokenId?: string
        hideSucceeded?: boolean
        // Attack result data
        damage?: number
        victimHPBefore?: number
        victimHPAfter?: number
        killed?: boolean
    } | null>(null)
    const [canCall, setCanCall] = useState<boolean>(true);
    const [collectionMinting, setCollectionMinting] = useState<boolean>(false);
    const [showBatchLoadingModal, setShowBatchLoadingModal] = useState<boolean>(false);
    const [batchProgress, setBatchProgress] = useState<{
        currentBatch: number;
        totalBatches: number;
        processedTokens: number;
        totalTokens: number;
    }>({ currentBatch: 0, totalBatches: 0, processedTokens: 0, totalTokens: 0 });

    // Fetch mint price for reward display
    useEffect(() => {
        const fetchMintPrice = async () => {
            try {
                if (!walletProvider) return
                const ethersProvider = new ethers.BrowserProvider(walletProvider as ethers.Eip1193Provider)
                const contract = new ethers.Contract(pepurgeContractAddress, pepurgeAbi, ethersProvider)
                const mintPriceWei = await contract.mintPrice()
                const mintPriceEth = ethers.formatEther(mintPriceWei)
                setMintPrice(mintPriceEth)
            } catch (error) {
                setMintPrice("0.0")
            }
        }
        fetchMintPrice()
    }, [walletProvider])

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
        const TwelveHours = 12 * 60 * 60

        if (timeSinceLastAction >= TwelveHours) {
            return { canAct: true, timeUntilNextAction: "Ready" }
        }

        const timeRemaining = TwelveHours - timeSinceLastAction
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

    // Fetch collection status
    useEffect(() => {
        const fetchCollectionStatus = async () => {
            try {
                if (!walletProvider) return;
                const ethersProvider = new ethers.BrowserProvider(walletProvider as ethers.Eip1193Provider);
                const contract = new ethers.Contract(pepurgeContractAddress, pepurgeAbi, ethersProvider);
                const totalMinted = await contract.totalMinted();
                const supply = await contract.supply();
                const canCallVal = totalMinted >= supply;
                setCanCall(canCallVal);
                setCollectionMinting(!canCallVal);
             //   console.log("Can call function (collection still minting?):", canCallVal);
            } catch (e) {
                setCanCall(true);
                setCollectionMinting(false);
            }
        };
        fetchCollectionStatus();
    }, [walletProvider])

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

    // Fetch all tokenIds from 0 to totalMinted-1, then for each, fetch HP, hidden, timestamp, etc.
    const fetchAvailableTargets = async () => {
        try {
            if (!walletProvider) return

            const ethersProvider = new ethers.BrowserProvider(walletProvider as ethers.Eip1193Provider)
            const contract = new ethers.Contract(pepurgeContractAddress, pepurgeAbi, ethersProvider)

            // Get total minted
            let totalMinted = 0
            try {
                totalMinted = Number(await contract.totalMinted())
            } catch (e) {
                // fallback: try totalSupply
                try {
                    totalMinted = Number(await contract.totalSupply())
                } catch (e2) {
                    totalMinted = 0
                }
            }
            if (totalMinted === 0) {
                setAvailableTargets([])
                setRandomizedTargets([])
                return
            }

            // Show loading modal and initialize progress
            setShowBatchLoadingModal(true)
            const BATCH_SIZE = 10
            const totalBatches = Math.ceil(totalMinted / BATCH_SIZE)
            setBatchProgress({
                currentBatch: 0,
                totalBatches,
                processedTokens: 0,
                totalTokens: totalMinted
            })

            // Prepare array of tokenIds
            const tokenIds = Array.from({ length: totalMinted }, (_, i) => i)
            const userTokenIds = userPepurges.map(p => p.tokenId)
            const now = Math.floor(Date.now() / 1000)
            const TWELVE_HOURS = 12 * 60 * 60

            // Helper function to parse tokenURI metadata
            const parseTokenMetadata = (tokenURI: string) => {
                try {
                    // Remove data URI prefix if present
                    const base64Data = tokenURI.replace(/^data:application\/json;base64,/, '')
                    const jsonString = atob(base64Data)
                    const metadata = JSON.parse(jsonString)
                    
                    // Extract attributes
                    const attributes = metadata.attributes || []
                    const getAttributeValue = (traitType: string) => {
                        const attr = attributes.find((a: any) => a.trait_type === traitType)
                        return attr ? Number(attr.value) : 0
                    }

                    return {
                        type: getAttributeValue('type'),
                        attack: getAttributeValue('Attack'),
                        HP: getAttributeValue('HP'),
                        defense: getAttributeValue('Defense'),
                        maxHp: getAttributeValue('Max HP')
                    }
                } catch (e) {
                    console.error('Error parsing token metadata:', e)
                    return { type: 0, attack: 0, HP: 0, defense: 0, maxHp: 0 }
                }
            }

            // Helper function with retry logic for individual token
            const fetchTokenDataWithRetry = async (tokenId: number, maxRetries = 3): Promise<any> => {
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        // Fetch basic stats and metadata
                        const [hidden, timestamp, tokenURI] = await Promise.all([
                            contract.hidden(tokenId),
                            contract.timestamp(tokenId),
                            contract.tokenURI(tokenId)
                        ])

                        // Parse metadata from tokenURI
                        const metadata = parseTokenMetadata(tokenURI)
                        
                        return {
                            tokenId: tokenId.toString(),
                            type: metadata.type,
                            hp: Number(metadata.HP),
                            maxHp: metadata.maxHp,
                            attack: metadata.attack,
                            defense: metadata.defense,
                            isHidden: Boolean(hidden),
                            lastActionTimestamp: Number(timestamp),
                            imageUrl: `/pepes/${metadata.type}.png`
                        }
                    } catch (e) {
                        console.error(`Attempt ${attempt} failed for token ${tokenId}:`, e)
                        if (attempt === maxRetries) {
                            console.error(`All attempts failed for token ${tokenId}`)
                            return null
                        }
                        // Wait before retry (exponential backoff)
                        await new Promise(resolve => setTimeout(resolve, attempt * 1000))
                    }
                }
                return null
            }

            // Process tokens in batches to avoid rate limits
            const pepeData: any[] = []
            
            for (let i = 0; i < tokenIds.length; i += BATCH_SIZE) {
                const batch = tokenIds.slice(i, i + BATCH_SIZE)
                const currentBatchNum = Math.floor(i / BATCH_SIZE) + 1
                
                // Update progress
                setBatchProgress(prev => ({
                    ...prev,
                    currentBatch: currentBatchNum,
                    processedTokens: i
                }))
                
                console.log(`Fetching batch ${currentBatchNum}/${totalBatches}`)
                
                const batchResults = await Promise.all(
                    batch.map(tokenId => fetchTokenDataWithRetry(tokenId))
                )
                
                pepeData.push(...batchResults)
                
                // Add delay between batches to respect rate limits
                if (i + BATCH_SIZE < tokenIds.length) {
                    await new Promise(resolve => setTimeout(resolve, 500)) // 500ms delay between batches
                }
            }

            // Final progress update
            setBatchProgress(prev => ({
                ...prev,
                processedTokens: totalMinted,
                currentBatch: totalBatches
            }))

            // Filter out nulls, dead, and own pepes, then map to TargetPepurge
            const targets: TargetPepurge[] = pepeData
                .filter((pepe): pepe is NonNullable<typeof pepe> => pepe !== null)
                .filter((pepe) => {
                    if (userTokenIds.includes(pepe.tokenId)) return false
                    if (pepe.hp <= 0) return false
                    // Only attackable if not hidden, or hidden but cooldown passed
                    if (pepe.isHidden) {
                        const timeSinceLastAction = now - pepe.lastActionTimestamp
                        if (timeSinceLastAction < TWELVE_HOURS) return false
                    }
                    return true
                })
                .map((pepe) => ({
                    tokenId: pepe.tokenId,
                    type: pepe.type,
                    hp: pepe.hp,
                    maxHp: pepe.maxHp,
                    attack: pepe.attack,
                    defense: pepe.defense,
                    lastActionTimestamp: pepe.lastActionTimestamp,
                    imageUrl: pepe.imageUrl
                }))

            setAvailableTargets(targets)
            // Randomize targets for pagination
            const shuffled = [...targets].sort(() => Math.random() - 0.5)
            setRandomizedTargets(shuffled)
        } catch (error) {
            console.error("Error fetching available targets:", error)
        } finally {
            // Hide loading modal
            setShowBatchLoadingModal(false)
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
                // Estimate gas and add 100% buffer for attack
                const estimatedGas = await contract.Attack.estimateGas(selectedPepurge.tokenId, targetTokenId)
                const gasLimit = estimatedGas * 2n // 100% over estimated
                
                tx = await contract.Attack(selectedPepurge.tokenId, targetTokenId, { gasLimit })
                resultMessage = "BLOOD SPILLED!"
            } else {
                // Estimate gas and add 100% buffer for hide
                const estimatedGas = await contract.Hide.estimateGas(selectedPepurge.tokenId)
                const gasLimit = estimatedGas * 2n // 100% over estimated
                
                tx = await contract.Hide(selectedPepurge.tokenId, { gasLimit })
            }
            
            const receipt = await tx.wait()
            
            // Initialize attack result data
            let damage: number | undefined
            let victimHPBefore: number | undefined
            let victimHPAfter: number | undefined
            let killed: boolean | undefined
            
            // Parse events based on action type
            if (actionType === "attack") {
                // Parse AttackResult event
                receipt.logs.forEach((log: any) => {
                    try {
                        const parsedLog = contract.interface.parseLog(log)
                        if (parsedLog?.name === "AttackResult") {
                            damage = Number(parsedLog.args.damage)
                            victimHPBefore = Number(parsedLog.args.victimHPBefore)
                            victimHPAfter = Number(parsedLog.args.victimHPAfter)
                            killed = parsedLog.args.killed
                            
                            console.log("AttackResult event:", {
                                attackerTokenId: Number(parsedLog.args.attackerTokenId),
                                victimTokenId: Number(parsedLog.args.victimTokenId),
                                damage,
                                victimHPBefore,
                                victimHPAfter,
                                killed
                            })
                            
                            // Update result message based on attack outcome
                            if (killed) {
                                resultMessage = "TARGET ELIMINATED!"
                            } else {
                                resultMessage = "BLOOD SPILLED!"
                            }
                        }
                    } catch (e) {
                        console.log("Unparsed log:", log)
                    }
                })
            }
            
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
                hideSucceeded: actionType === "hide" ? hideSucceeded : undefined,
                // Attack result data
                damage: actionType === "attack" ? damage : undefined,
                victimHPBefore: actionType === "attack" ? victimHPBefore : undefined,
                victimHPAfter: actionType === "attack" ? victimHPAfter : undefined,
                killed: actionType === "attack" ? killed : undefined
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
        setSearchTokenId("")
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
                    <p className="text-xl md:text-2xl text-white font-nosifer">
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
                            <p className="text-3xl font-nosifer text-white flex items-center justify-center">
                                YOUR ARMY ({userPepurges.length})
                            </p>
                        </div>
                        
                        {/* Pepurge Grid */}
                        <div className="relative">
                            {collectionMinting && (
                                <>
                                    {/* Grey transparent overlay */}
                                    <div className="fixed inset-0 bg-gray-800/60 z-30 pointer-events-none" />
                                    {/* Centered text overlay */}
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
                                        <span className="text-white font-bold text-3xl md:text-4xl font-nosifer text-center drop-shadow-lg bg-black bg-opacity-40 px-8 py-4 rounded-xl border-4 border-white">
                                            Collection still minting
                                        </span>
                                    </div>
                                </>
                            )}
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

                                            {/* Status: HIDDEN only if hidden and cooldown not passed */}
                                            {(() => {
                                                if (pepurge.isHidden) {
                                                    const now = Math.floor(Date.now() / 1000)
                                                    const TWELVE_HOURS = 12 * 60 * 60
                                                    const timeSinceLastAction = now - pepurge.lastActionTimestamp
                                                    if (timeSinceLastAction < TWELVE_HOURS) {
                                                        return (
                                                            <div className="flex items-center justify-center space-x-1 md:space-x-2 bg-purple-900 py-1 md:py-2 px-2 md:px-4 rounded">
                                                                <EyeOff className="text-purple-300 w-3 h-3 md:w-5 md:h-5" />
                                                                <span className="text-purple-300 font-nosifer text-xs md:text-sm">HIDDEN</span>
                                                            </div>
                                                        )
                                                    }
                                                }
                                                if (pepurge.hp === 0) {
                                                    return (
                                                        <div className="flex items-center justify-center space-x-1 md:space-x-2 bg-gray-800 py-1 md:py-2 px-2 md:px-4 rounded">
                                                            <Skull className="text-gray-400 w-3 h-3 md:w-5 md:h-5" />
                                                            <span className="text-gray-400 font-nosifer text-xs md:text-sm">DEAD</span>
                                                        </div>
                                                    )
                                                }
                                                // Default: EXPOSED
                                                return (
                                                    <div className="flex items-center justify-center space-x-1 md:space-x-2 bg-red-900 py-1 md:py-2 px-2 md:px-4 rounded">
                                                        <Eye className="text-red-300 w-3 h-3 md:w-5 md:h-5" />
                                                        <span className="text-red-300 font-nosifer text-xs md:text-sm">EXPOSED</span>
                                                    </div>
                                                )
                                            })()}
                                            
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
                                                        disabled={(() => {
                                                            if (!pepurge.canAct || !canCall) return true;
                                                            if (pepurge.isHidden) {
                                                                const now = Math.floor(Date.now() / 1000);
                                                                const TWELVE_HOURS = 12 * 60 * 60;
                                                                const timeSinceLastAction = now - pepurge.lastActionTimestamp;
                                                                if (timeSinceLastAction < TWELVE_HOURS) return true;
                                                            }
                                                            return false;
                                                        })()}
                                                        className={`flex-1 py-1 md:py-2 px-2 md:px-3 border-2 text-xs md:text-sm font-nosifer ${
                                                            (!pepurge.canAct || !canCall || (pepurge.isHidden && (() => {
                                                                const now = Math.floor(Date.now() / 1000);
                                                                const TWELVE_HOURS = 12 * 60 * 60;
                                                                const timeSinceLastAction = now - pepurge.lastActionTimestamp;
                                                                return timeSinceLastAction < TWELVE_HOURS;
                                                            })()))
                                                                ? 'bg-gray-500 hover:bg-gray-500 text-gray-300 border-gray-400 cursor-not-allowed'
                                                                : 'bg-red-600 hover:bg-red-700 text-white border-red-400'
                                                        }`}
                                                    >
                                                        <Sword className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                                                        ATTACK
                                                    </Button>
                                                    <Button
                                                        onClick={() => openActionModal(pepurge, "hide")}
                                                        disabled={!pepurge.canAct || !canCall}
                                                        className={`flex-1 py-1 md:py-2 px-2 md:px-3 border-2 text-xs md:text-sm font-nosifer ${
                                                            !pepurge.canAct || !canCall
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
                        </div>
                    </>
                )}
            </div>

            {/* Action Modal */}
            <Dialog open={showActionModal} onOpenChange={setShowActionModal}>
                <DialogContent className="bg-[#b31c1e] border-4 border-black max-w-md max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-3xl font-nosifer text-white text-center">
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
                                <div className="text-white font-nosifer text-xl">
                                    PEPURGE #{selectedPepurge.tokenId}
                                </div>
                                <div className="flex items-center justify-center space-x-4 mt-2 text-sm">
                                    <div className="flex items-center space-x-1">
                                        <Heart className="text-red-600 w-4 h-4" />
                                        <span className="text-white font-nosifer">{selectedPepurge.hp}</span>
                                    </div>
                                    <div className="flex items-center space-x-1">
                                        <Sword className="text-orange-600 w-4 h-4" />
                                        <span className="text-white font-nosifer">{selectedPepurge.attack}</span>
                                    </div>
                                    <div className="flex items-center space-x-1">
                                        <Shield className="text-blue-600 w-4 h-4" />
                                        <span className="text-white font-nosifer">{selectedPepurge.defense}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Target Selection for Attack */}
                            {actionType === "attack" && (
                                <div className="space-y-3">
                                    <div className="text-center">
                                        <Label className="text-white font-nosifer text-lg">
                                            SELECT VICTIM:
                                        </Label>
                                    </div>
                                    
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
                                                // Filter targets first by user ownership, then by search
                                                let filteredTargets = randomizedTargets.filter(target => target.tokenId !== selectedPepurge.tokenId)
                                                
                                                // Apply search filter if search term exists
                                                if (searchTokenId.trim()) {
                                                    filteredTargets = filteredTargets.filter(target => 
                                                        target.tokenId.toLowerCase().includes(searchTokenId.toLowerCase())
                                                    )
                                                }
                                                
                                                const startIndex = currentTargetPage * targetsPerPage
                                                const endIndex = startIndex + targetsPerPage
                                                const currentTargets = filteredTargets.slice(startIndex, endIndex)
                                                const totalPages = Math.ceil(filteredTargets.length / targetsPerPage)

                                                return (
                                                    <>
                                                        {/* Search Bar */}
                                                        <div className="space-y-2">
                                                            <Input
                                                                type="number"
                                                                inputMode="numeric"
                                                                pattern="[0-9]*"
                                                                placeholder="Search by Token ID..."
                                                                value={searchTokenId}
                                                                onChange={(e) => {
                                                                    setSearchTokenId(e.target.value)
                                                                    setCurrentTargetPage(0) // Reset to first page when searching
                                                                }}
                                                                className="bg-white border-2 border-gray-300 text-black placeholder-gray-500 font-nosifer text-sm"
                                                                autoFocus={false}
                                                            />
                                                        
                                                        </div>

                                                        {filteredTargets.length === 0 ? (
                                                            <div className="p-6 text-center text-gray-500 font-nosifer bg-gray-100 rounded border-2 border-gray-300">
                                                                {searchTokenId ? `No targets found for "${searchTokenId}"` : "No targets available"}
                                                            </div>
                                                        ) : (
                                                            <>
                                                                {/* Target Grid */}
                                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 bg-gray-600 border-2 border-black p-3 rounded max-h-60 overflow-y-auto">
                                                                    {currentTargets.map((target) => (
                                                                        <div
                                                                            key={target.tokenId}
                                                                            onClick={() => setTargetTokenId(target.tokenId)}
                                                                            className="bg-gray-50 hover:bg-gray-200 border-2 bg-gray-300 border-gray-300 hover:border-red-400 p-2 rounded cursor-pointer transition-all"
                                                                        >
                                                                            <div className="text-center space-y-1">
                                                                                <img 
                                                                                    src={target.imageUrl} 
                                                                                    alt={`Pepurge #${target.tokenId}`}
                                                                                    className="w-20 h-20 mx-auto rounded border border-gray-400"
                                                                                />
                                                                                <div className="font-nosifer text-black text-xs">#{target.tokenId}</div>
                                                                                <div className="grid grid-cols-3 text-[10px]">
                                                                                    <div className="text-center">
                                                                                        <div className="text-red-600 font-bold">{target.hp}</div>
                                                                                        <div className="text-red-500 text-[8px]">❤️</div>
                                                                                    </div>
                                                                                    <div className="text-center">
                                                                                        <div className="text-orange-600 font-bold">{target.attack}</div>
                                                                                        <div className="text-orange-500 text-[8px]">⚔️</div>
                                                                                    </div>
                                                                                    <div className="text-center">
                                                                                        <div className="text-blue-600 font-bold">{target.defense}</div>
                                                                                        <div className="text-blue-500 text-[8px]">🛡️</div>
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
                    {/* Only show DialogHeader if not a hide failure */}
                    {!(actionResult && actionResult.type === "hide" && actionResult.hideSucceeded === false) && (
                        <DialogHeader>
                            <DialogTitle className={`text-3xl font-nosifer text-center ${
                                actionResult?.success ? 'text-white' : 'text-red-900'
                            }`}>
                                {actionResult?.success ? '🩸 SUCCESS! 🩸' : '💀 FAILED! 💀'}
                            </DialogTitle>
                        </DialogHeader>
                    )}
                    
                    {actionResult && (
                        <div className="space-y-6 text-center">
                            <div className="text-white font-nosifer text-lg">
                                {actionResult.message}
                            </div>
                            
                            {actionResult.success ? (
                                <div className="space-y-3">
                                    <div className="text-white font-nosifer">
                                        {actionResult.type === "attack" 
                                            ? `Pepurge #${actionResult.pepurgeTokenId} attacked Pepurge #${actionResult.targetTokenId}!`
                                            : ``
                                        }
                                    </div>
                                    <div className="bg-black border-2 border-red-800 p-4 rounded">
                                        <div className="text-[#b31c1e] text-sm space-y-1 font-nosifer">
                                            {actionResult.type === "attack" ? (
                                                <>
                                                    {actionResult.killed ? (
                                                        <>
                                                            <p>🗡️ TARGET KILLED!</p>
                                                            <p>💀 Pepurge #{actionResult.targetTokenId} has been eliminated!</p>
                                                            <p className="text-green-400 font-bold">
                                                                {mintPrice !== "0.0" && (
                                                                    <>
                                                                        {`+${(Number(mintPrice) * 0.5).toFixed(6)} ETH received`}
                                                                    </>
                                                                )}
                                                            </p>
                                                            {actionResult.damage !== undefined && (
                                                                <p>⚔️ Damage Dealt: {actionResult.damage}</p>
                                                            )}
                                                            {actionResult.victimHPBefore !== undefined && actionResult.victimHPAfter !== undefined && (
                                                                <p>❤️ HP: {actionResult.victimHPBefore} → {actionResult.victimHPAfter}</p>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <p>🗡️ DAMAGE DEALT!</p>
                                                            <p>🎯 Target still alive!</p>
                                                            {actionResult.damage !== undefined && (
                                                                <p>⚔️ Damage Dealt: {actionResult.damage}</p>
                                                            )}
                                                            {actionResult.victimHPBefore !== undefined && actionResult.victimHPAfter !== undefined && (
                                                                <p>❤️ Target HP: {actionResult.victimHPBefore} → {actionResult.victimHPAfter}</p>
                                                            )}
                                                        </>
                                                    )}
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
                                CLOSE
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Batch Loading Modal */}
            <Dialog open={showBatchLoadingModal} onOpenChange={() => {}}>
                <DialogContent className="bg-[#b31c1e] border-4 border-black max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-3xl font-nosifer text-white text-center">
                            🩸 SUMMONING TARGETS 🩸
                        </DialogTitle>
                    </DialogHeader>
                    
                    <div className="space-y-6 text-center">
                        <div className="text-white font-nosifer text-lg">
                            SCANNING THE BATTLEFIELD...
                        </div>
                        
                        <div className="space-y-4">
                            {/* Progress Bar */}
                            <div className="bg-black border-2 border-red-800 rounded-lg p-4">
                                <div className="flex justify-between text-sm text-white font-nosifer mb-2">
                                    <span>BATCH {batchProgress.currentBatch} / {batchProgress.totalBatches}</span>
                                    <span>{batchProgress.processedTokens} / {batchProgress.totalTokens}</span>
                                </div>
                                <div className="w-full bg-red-900 rounded-full h-4 border border-red-600">
                                    <div 
                                        className="bg-gradient-to-r from-red-500 to-red-400 h-full rounded-full transition-all duration-300 ease-out"
                                        style={{ 
                                            width: `${batchProgress.totalTokens > 0 ? (batchProgress.processedTokens / batchProgress.totalTokens) * 100 : 0}%` 
                                        }}
                                    ></div>
                                </div>
                                <div className="text-center text-white font-nosifer text-sm mt-2">
                                    {batchProgress.totalTokens > 0 ? Math.round((batchProgress.processedTokens / batchProgress.totalTokens) * 100) : 0}%
                                </div>
                            </div>

                            {/* Animated skull */}
                            <div className="flex justify-center">
                                <Skull className="w-12 h-12 text-white animate-pulse" />
                            </div>

                            <div className="bg-black border-2 border-red-800 p-4 rounded">
                                <div className="text-[#b31c1e] text-sm space-y-1 font-nosifer">
                                    <p>• FETCHING TOKEN METADATA</p>
                                    <p>• ANALYZING BATTLE STATUS</p>
                                    <p>• IDENTIFYING TARGETS</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
