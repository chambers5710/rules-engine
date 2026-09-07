import { openDefaultSession } from "./session.js"
import { Phase } from "./types.js"
import { chooseIndex } from "./ui.js"

console.log("Initializing...")
const session = await openDefaultSession()

while (session.frame().gamestate.phase !== Phase.Ended) {
  const { choices } = session.frame()
  if (choices.length === 0) break
  session.choose(await chooseIndex(choices))
}

console.log("Wrote gamestate.md")
