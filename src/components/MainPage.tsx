
import pepurgePage from "./pepurgePage"
import React, { useState } from "react"
import NavBar from "./NavBar"
import { SectionType } from "./types/SectionTypes"


export default function MainPage(): React.JSX.Element {
    const [currentView, setCurrentView] = useState<SectionType>("landing")
    
    
    // Override setCurrentView to prevent navigation when feature flag is set
    const handleSetCurrentView = (view: SectionType) => {
  
        setCurrentView(view)
    }

    return (
        <>
            <div>
                {currentView === "landing" && (
                    <pepurgePage />
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