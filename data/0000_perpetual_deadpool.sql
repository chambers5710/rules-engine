CREATE TABLE `Card` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`supertype` text NOT NULL,
	`number` text NOT NULL,
	`rarity` text,
	`artist` text,
	`flavorText` text,
	`legalities` text NOT NULL,
	`images` text NOT NULL,
	`regulationMark` text,
	`hp` text,
	`level` text,
	`subtypes` text,
	`types` text,
	`evolvesFrom` text,
	`evolvesTo` text,
	`abilities` text,
	`attacks` text,
	`weaknesses` text,
	`resistances` text,
	`retreatCost` text,
	`convertedRetreatCost` integer,
	`nationalPokedexNumbers` text,
	`ancientTrait` text,
	`rules` text,
	`setId` text NOT NULL,
	FOREIGN KEY (`setId`) REFERENCES `Set`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `DeckCard` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`deckId` text NOT NULL,
	`cardId` text NOT NULL,
	FOREIGN KEY (`deckId`) REFERENCES `Deck`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`cardId`) REFERENCES `Card`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `DeckCard_deckId_cardId_key` ON `DeckCard` (`deckId`,`cardId`);--> statement-breakpoint
CREATE TABLE `Deck` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`types` text NOT NULL,
	`setId` text,
	FOREIGN KEY (`setId`) REFERENCES `Set`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `Set` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`series` text NOT NULL,
	`printedTotal` integer NOT NULL,
	`total` integer NOT NULL,
	`legalities` text NOT NULL,
	`ptcgoCode` text,
	`releaseDate` text,
	`updatedAt` text,
	`symbolUrl` text,
	`logoUrl` text
);
