import fs, { writeFileSync } from "fs";
import path from "path";

const cardsDir = '../data/cards';
const cardsCombined = fs.readdirSync(cardsDir)
  .filter(f => f.endsWith('.json'))
  .flatMap(f => JSON.parse(fs.readFileSync(path.join(cardsDir, f), 'utf8')));

fs.writeFileSync('../data/cards.json', JSON.stringify(cardsCombined));

const decksDir = '../data/decks';
const decksCombined = fs.readdirSync(decksDir)
  .filter(f => f.endsWith('.json'))
  .flatMap(f => JSON.parse(fs.readFileSync(path.join(decksDir, f), 'utf8')));

fs.writeFileSync('../data/decks.json', JSON.stringify(decksCombined));