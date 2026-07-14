import { useState } from "react"
import { ArrowLeft, Info, Sword } from "lucide-react"
import NightmarePage from "./NightmarePage"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"

type View = "landing" | "nightmare"

export default function MainPage(): React.JSX.Element {
    const [currentView, setCurrentView] = useState<View>("landing")
    const [showRules, setShowRules] = useState(false)

    return (
        <div className="relative min-h-screen">
            <div className="fixed top-4 right-4 z-40">
                <Button
                    onClick={() => setShowRules(true)}
                    size="icon"
                    title="Game rules"
                    aria-label="Open game rules"
                    className="bg-black text-[#CCFF00] border-2 border-[#CCFF00] hover:bg-[#CCFF00] hover:text-black"
                >
                    <Info className="h-5 w-5" />
                </Button>
            </div>

            {currentView === "landing" ? (
                <main className="min-h-screen bg-black flex items-center justify-center p-4">
                    <div className="text-center space-y-8">
                        <img
                            src="/Pepurge.png"
                            alt="Pepurge"
                            className="w-[75vw] md:w-[40vw] max-w-4xl mx-auto drop-shadow-2xl"
                        />
                        <Button
                            onClick={() => setCurrentView("nightmare")}
                            className="w-full h-auto bg-[#CCFF00] text-black hover:bg-[#D4D0C9] border-4 border-[#CCFF00] text-xl md:text-2xl font-bold py-4 px-8 font-nosifer"
                        >
                            <Sword className="w-6 h-6 mr-3" />
                            BATTLE REALM
                        </Button>
                    </div>
                </main>
            ) : (
                <div className="relative">
                    <Button
                        onClick={() => setCurrentView("landing")}
                        size="icon"
                        title="Return to title"
                        aria-label="Return to title"
                        className="fixed top-4 left-4 z-40 bg-black text-[#CCFF00] border-2 border-[#CCFF00] hover:bg-[#CCFF00] hover:text-black"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <NightmarePage />
                </div>
            )}

            <Dialog open={showRules} onOpenChange={setShowRules}>
                <DialogContent className="bg-black border-4 border-[#CCFF00] text-[#D4D0C9] w-[calc(100%-1rem)] max-w-4xl max-h-[90vh] overflow-y-auto font-nosifer">
                    <DialogHeader>
                        <DialogTitle className="text-xl md:text-3xl text-[#CCFF00] text-center pr-8">
                            RULES OF THE PURGE
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-8 text-left text-sm leading-6 font-sans">
                        <section className="space-y-4">
                            <RuleHeading>Character Stats</RuleHeading>
                            <p>Every Pepurge has three core stats that determine how it performs in battle:</p>
                            <RuleDefinition title="Attack">
                                Determines how much damage the Pepurge deals when attacking.
                            </RuleDefinition>
                            <RuleDefinition title="Defense">
                                Reduces the damage received from each attacker. Damage is calculated
                                separately for every attacking Pepurge:
                            </RuleDefinition>
                            <Formula>Damage = Attack + 2 - Target&apos;s Defense</Formula>
                            <p>
                                Every attacker deals at least <Strong>1 damage</Strong>, even when the
                                target&apos;s Defense is higher.
                            </p>
                            <RuleDefinition title="HP and Max HP">
                                HP is the Pepurge&apos;s current health. Max HP is the highest amount of
                                health it can have.
                            </RuleDefinition>
                            <p>
                                Taking damage lowers its HP. A successful Hide action can restore up
                                to <Strong>2 HP</Strong>, without exceeding Max HP. A Pepurge that
                                reaches <Strong>0 HP</Strong> is killed and permanently burned.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <RuleHeading>How Battle Works</RuleHeading>
                            <p>
                                Battle begins after the configured collection has minted, or the owner
                                permanently finalizes an undersold supply, and then activates the game.
                            </p>
                            <p>Each Pepurge can perform <Strong>one action per cooldown</Strong>:</p>
                            <RuleList items={["Attack an enemy", "Attempt to hide"]} />
                            <p>
                                After taking an action, the Pepurge enters cooldown. The live timer
                                shown on each character tells you when it can act again.
                            </p>
                            <p>
                                You cannot target your own Pepurge, use the same Pepurge more than once
                                in the same attack, or attack a hidden character.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <RuleHeading>Attack</RuleHeading>
                            <p>
                                Choose <Strong>one or more</Strong> of your ready, exposed Pepurges, then
                                select one exposed enemy as the target.
                            </p>
                            <p>
                                Each attacker&apos;s damage is calculated using its Attack stat and the
                                target&apos;s Defense stat. Every attacker deals at least <Strong>1 damage</Strong>,
                                and all damage is combined against the selected target.
                            </p>
                            <p>After the attack, every Pepurge used as an attacker enters cooldown.</p>
                            <p>
                                Defeating an enemy also gives a bonus. The bonus changes depending on
                                how many Pepurges remain alive.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <RuleHeading>Hide</RuleHeading>
                            <p>
                                While more than <Strong>25% of the collection remains alive</Strong>, a
                                ready Pepurge can attempt to hide.
                            </p>
                            <p>The attempt has a <Strong>50% chance of success</Strong>:</p>
                            <RuleList
                                items={[
                                    "On success, the Pepurge becomes hidden for its full cooldown and restores up to 2 HP.",
                                    "On failure, it does not hide or heal, but the action is still used and the Pepurge enters cooldown.",
                                ]}
                            />
                            <p>
                                Hidden Pepurges cannot be attacked. They automatically become exposed
                                when their cooldown ends. When the game reaches 25% remaining, every
                                hidden Pepurge becomes exposed immediately and hiding is disabled for
                                the rest of the game.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <RuleHeading>Cooldown</RuleHeading>
                            <p>
                                Each Pepurge can attack or attempt to hide <Strong>once per contract cooldown</Strong>.
                            </p>
                            <p>
                                After performing either action, it must wait until its cooldown ends
                                before acting again. The live timer on the character shows exactly when
                                it will be ready.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <RuleHeading>Kill Bonuses and Rewards</RuleHeading>
                            <p>
                                The reward for defeating an enemy changes as the number of surviving
                                Pepurges decreases.
                            </p>
                            <RuleSubheading>More Than 25% Remaining</RuleSubheading>
                            <p>
                                When a kill leaves more than <Strong>25% of the collection alive</Strong>,
                                it does not give a monetary reward.
                            </p>
                            <p>
                                Instead, <Strong>one random Pepurge used in the successful attack becomes hidden</Strong>,
                                protecting it from enemy attacks until its cooldown ends.
                            </p>
                            <RuleSubheading>25% or Less Remaining</RuleSubheading>
                            <p>
                                When a kill leaves <Strong>25% or less of the collection alive</Strong>,
                                it earns a monetary reward.
                            </p>
                            <p>
                                At activation, half of the game balance is allocated to paid kills.
                                Each reward is calculated from the kill pool and the number of eligible
                                paid kills that remain.
                            </p>
                            <Formula>Kill reward = current kill pool / remaining paid kills</Formula>
                            <p>Rewards are credited to your account and must be claimed separately.</p>
                            <RuleSubheading>Final 10 Survivors</RuleSubheading>
                            <p>
                                The production game&apos;s final <Strong>10 surviving Pepurges</Strong> can
                                each be cashed in for an equal share of the remaining winner pool. Local
                                test deployments may use a smaller survivor threshold.
                            </p>
                            <p>Cashing in a survivor permanently burns that Pepurge.</p>
                            <RuleSubheading>Owner Withdrawals</RuleSubheading>
                            <p>
                                The contract owner can withdraw uncredited ETH during the game. After a
                                withdrawal, the remaining uncredited balance is reallocated across future
                                kills and survivor rewards. Rewards already credited to players remain
                                protected and can still be claimed in full.
                            </p>
                        </section>

                        <section className="space-y-4 border-t border-[#D4D0C9]/40 pt-8">
                            <RuleHeading>Ownership and Burning</RuleHeading>
                            <p>
                                A Pepurge&apos;s current HP, cooldown timer, and hidden status remain
                                attached to the NFT when it is transferred to another owner.
                            </p>
                            <p>
                                A Pepurge is permanently burned when it is killed in battle or cashed
                                in as a final survivor.
                            </p>
                        </section>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function RuleHeading({ children }: { children: React.ReactNode }) {
    return <h2 className="font-nosifer text-xl text-[#CCFF00]">{children}</h2>
}

function RuleSubheading({ children }: { children: React.ReactNode }) {
    return <h3 className="font-nosifer text-[#CCFF00]">{children}</h3>
}

function RuleDefinition({
    title,
    children,
}: {
    title: string
    children: React.ReactNode
}) {
    return (
        <div>
            <h3 className="font-bold text-[#CCFF00]">{title}</h3>
            <p>{children}</p>
        </div>
    )
}

function RuleList({ items }: { items: string[] }) {
    return (
        <ul className="list-disc space-y-1 pl-6 marker:text-[#CCFF00]">
            {items.map((item) => (
                <li key={item}>{item}</li>
            ))}
        </ul>
    )
}

function Formula({ children }: { children: React.ReactNode }) {
    return (
        <div className="border-l-4 border-[#CCFF00] bg-[#D4D0C9]/10 px-4 py-3 font-mono font-bold text-[#CCFF00]">
            {children}
        </div>
    )
}

function Strong({ children }: { children: React.ReactNode }) {
    return <strong className="font-bold text-[#CCFF00]">{children}</strong>
}
