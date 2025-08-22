
import React, { useState } from "react"
import NavBar from "./NavBar"
import NightmarePage from "./NightmarePage"
import MintPage from "./MintPage"
import { SectionType } from "./types/SectionTypes"


export default function MainPage(): React.JSX.Element {
    const [currentView, setCurrentView] = useState<SectionType>("landing")
    
    const handleSetCurrentView = (view: SectionType) => {
        setCurrentView(view)
    }

    return (
        <>
            <div>
                {currentView === "landing" && (
                    <div className="min-h-screen bg-[#b31c1e] flex items-center justify-center p-4">
                        <div className="text-center space-y-8">
                          <div className="mb-8">
                        <img 
                            src="/Pepurge.png" 
                            alt="Pepurge" 
                            className="w-[60vw] max-w-4xl mx-auto mb-4 drop-shadow-2xl"
                        />
                   
                    </div>
                            <div className="space-y-4">
                                <button 
                                    onClick={() => handleSetCurrentView("mint")}
                                    className="block w-full bg-[#b31c1e] text-black hover:bg-red-800 border-4 border-black text-2xl font-bold py-4 px-8 font-creepster cursor-pointer"
                                >
                                    SUMMON PEPURGE
                                </button>
                           
                                <button 
                                    onClick={() => handleSetCurrentView("nightmare")}
                                    className="block w-full bg-[#b31c1e] text-black hover:bg-red-800 border-4 border-black text-2xl font-bold py-4 px-8 font-creepster cursor-pointer"
                                >
                                    NIGHTMARE REALM
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {currentView === "mint" && (
                    <div>
                        <button 
                            onClick={() => handleSetCurrentView("landing")} 
                            className="fixed top-4 left-4 z-50 bg-black text-[#b31c1e] hover:bg-gray-800 border-2 border-black font-bold py-2 px-4 font-creepster"
                        >
                            ← RETURN
                        </button>
                        <MintPage />
                    </div>
                )}
         
                {currentView === "nightmare" && (
                    <div>
                        <button 
                            onClick={() => handleSetCurrentView("landing")} 
                            className="fixed top-4 left-4 z-50 bg-black text-[#b31c1e] hover:bg-gray-800 border-2 border-black font-bold py-2 px-4 font-creepster"
                        >
                            ← RETURN
                        </button>
                        <NightmarePage />
                    </div>
                )}
            </div>

            <style>{`
                @font-face {
                    font-family: 'GameBoy';
                    src: url('/fonts/gameboy.woff2') format('woff2');
                }
                
                .font-mono {
                    font-family: 'GameBoy', monospace;
                }
            `}</style>
        </>
    )
}