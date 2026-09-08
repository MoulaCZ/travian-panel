# Travian side panel

A read-only side panel for Travian Legends. It reads the pages the game already renders and
works out the things the game does not put anywhere: when each farm list was last sent, how
often it can be sent without running out of troops, what the whole account produces per hour,
how much of that the army eats, and which villages nearby have stopped growing.

It never clicks anything in the game, never sends troops, never switches villages and never
posts anything. Every request it makes is a page you could open yourself.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser (Chrome, Edge, Opera,
   Firefox).
2. Open
   [travian-farmlist-timer.user.js](https://raw.githubusercontent.com/MoulaCZ/travian-panel/main/travian-farmlist-timer.user.js)
   — Tampermonkey offers to install it.
3. Open the game and press F5. A small **PANELS** bar appears in the corner; its buttons open
   and close the panels.

Updates arrive on their own — Tampermonkey checks this file and offers the new version.

The first time you use **Inactive near me**, Tampermonkey asks whether the script may talk to
`travcotools.com`. Allow it, or that one panel stays empty. You do not have to tell it which
game world you are on — it works that out from the address, and asks travcotools directly if
the world is new enough not to be in the built-in list.

## The panels

| Panel | What it answers |
|---|---|
| Farm lists | How long since each list was sent; amber and red marks are per list |
| Free for attacks | How many troops you can send away for 30 min / 1 h / 3 h / 8 h without starving the lists |
| In training | Time left in every village's barracks and stable; red when one stands idle |
| Production | What the account makes per hour, what the army eats, what the lists raid, and the daily total |
| Biggest hauls | The fattest hauls in your newest reports — where a manual attack pays |
| Inactive near me | Villages nearby that have stopped growing, minus the ones you already farm |
| Travel time | How long each of your units needs to any coordinates |
| List detail | One list: how often it can go, what it pays, how long the round trip is |

Every panel has a **?** in its header. Press it and the numbers are replaced by an explanation
of where they come from — press it again to go back.

## Settings

The **☰** button. Per-list thresholds, which villages to show, alerts when a list turns red,
the Tournament Square percentage per village (speed past 20 fields), and the filters for the
inactive search.

Everything is stored in your own browser, per game world. A different world starts empty.

## What it cannot know

- A farm list that is collapsed in the game sends no targets, so those targets cannot be
  checked or counted. Expand the list if a panel says so.
- Troop upkeep is exact only for the village you have open; for the others it is added up from
  the troop overview and the game's own crop-per-unit table.
- Raid income assumes you send every list at its red mark around the clock, so it is a ceiling.
