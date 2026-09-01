import json

CARD_JSON = 'base1.json'

# [ATTACKER][DEFENDER] (GEN 1)
TYPE_ADVANTAGE = {
    "NORMAL" : {
        "NORMAL": 1,
        "FIRE": 1,
        "WATER": 1,
        "ELECTRIC": 1,
        "GRASS": 1,
        "ICE": 1,
        "FIGHTING": 1,
        "POISON": 1,
        "GROUND": 1,
        "FLYING": 1,
        "PSYCHIC": 1,
        "BUG": 1,
        "ROCK": 0.5,
        "GHOST": 0,
        "DRAGON": 1
    },
    "FIRE" : {
        "NORMAL": 1,
        "FIRE": 0.5,
        "WATER": 0.5,
        "ELECTRIC": 1,
        "GRASS": 2,
        "ICE": 2,
        "FIGHTING": 1,
        "POISON": 1,
        "GROUND": 1,
        "FLYING": 1,
        "PSYCHIC": 1,
        "BUG": 2,
        "ROCK": 0.5,
        "GHOST": 1,
        "DRAGON": 0.5
    },
    "WATER": {
        "NORMAL": 1,
        "FIRE": 2,
        "WATER": 0.5,
        "ELECTRIC": 1,
        "GRASS": 0.5,
        "ICE": 1,
        "FIGHTING": 1,
        "POISON": 1,
        "GROUND": 2,
        "FLYING": 1,
        "PSYCHIC": 1,
        "BUG": 1,
        "ROCK": 2,
        "GHOST": 1,
        "DRAGON": 0.5
    },
    "ELECTRIC": {
        "NORMAL": 1,
        "FIRE": 1,
        "WATER": 2,
        "ELECTRIC": 0.5,
        "GRASS": 0.5,
        "ICE": 1,
        "FIGHTING": 1,
        "POISON": 1,
        "GROUND": 0,
        "FLYING": 2,
        "PSYCHIC": 1,
        "BUG": 1,
        "ROCK": 1,
        "GHOST": 1,
        "DRAGON": 0.5
    },
    "GRASS": {
        "NORMAL": 1,
        "FIRE": 0.5,
        "WATER": 2,
        "ELECTRIC": 1,
        "GRASS": 0.5,
        "ICE": 1,
        "FIGHTING": 1,
        "POISON": 0.5,
        "GROUND": 2,
        "FLYING": 0.5,
        "PSYCHIC": 1,
        "BUG": 0.5,
        "ROCK": 2,
        "GHOST": 1,
        "DRAGON": 0.5
    },
    "ICE": {
        "NORMAL": 1,
        "FIRE": 1,
        "WATER": 0.5,
        "ELECTRIC": 1,
        "GRASS": 2,
        "ICE": 0.5,
        "FIGHTING": 1,
        "POISON": 1,
        "GROUND": 2,
        "FLYING": 2,
        "PSYCHIC": 1,
        "BUG": 1,
        "ROCK": 1,
        "GHOST": 1,
        "DRAGON": 2
    },
    "FIGHTING": {
        "NORMAL": 2,
        "FIRE": 1,
        "WATER": 1,
        "ELECTRIC": 1,
        "GRASS": 1,
        "ICE": 2,
        "FIGHTING": 1,
        "POISON": 0.5,
        "GROUND": 1,
        "FLYING": 0.5,
        "PSYCHIC": 0.5,
        "BUG": 0.5,
        "ROCK": 2,
        "GHOST": 0,
        "DRAGON": 1
    },
    "POISON": {
        "NORMAL": 1,
        "FIRE": 1,
        "WATER": 1,
        "ELECTRIC": 1,
        "GRASS": 2,
        "ICE": 1,
        "FIGHTING": 1,
        "POISON": 0.5,
        "GROUND": 0.5,
        "FLYING": 1,
        "PSYCHIC": 1,
        "BUG": 2,
        "ROCK": 0.5,
        "GHOST": 0.5,
        "DRAGON": 1
    },
    "GROUND": {
        "NORMAL": 1,
        "FIRE": 2,
        "WATER": 1,
        "ELECTRIC": 2,
        "GRASS": 0.5,
        "ICE": 1,
        "FIGHTING": 1,
        "POISON": 2,
        "GROUND": 1,
        "FLYING": 0,
        "PSYCHIC": 1,
        "BUG": 0.5,
        "ROCK": 2,
        "GHOST": 1,
        "DRAGON": 1
    },
    "FLYING": {
        "NORMAL": 1,
        "FIRE": 1,
        "WATER": 1,
        "ELECTRIC": 0.5,
        "GRASS": 2,
        "ICE": 1,
        "FIGHTING": 2,
        "POISON": 1,
        "GROUND": 1,
        "FLYING": 1,
        "PSYCHIC": 1,
        "BUG": 2,
        "ROCK": 0.5,
        "GHOST": 1,
        "DRAGON": 1
    },
    "PSYCHIC": {
        "NORMAL": 1,
        "FIRE": 1,
        "WATER": 1,
        "ELECTRIC": 1,
        "GRASS": 1,
        "ICE": 1,
        "FIGHTING": 2,
        "POISON": 2,
        "GROUND": 1,
        "FLYING": 1,
        "PSYCHIC": 0.5,
        "BUG": 1,
        "ROCK": 1,
        "GHOST": 1,
        "DRAGON": 1
    },
    "BUG": {
        "NORMAL": 1,
        "FIRE": 0.5,
        "WATER": 1,
        "ELECTRIC": 1,
        "GRASS": 2,
        "ICE": 1,
        "FIGHTING": 0.5,
        "POISON": 2,
        "GROUND": 1,
        "FLYING": 0.5,
        "PSYCHIC": 2,
        "BUG": 1,
        "ROCK": 1,
        "GHOST": 0.5,
        "DRAGON": 1
    },
    "ROCK": {
        "NORMAL": 1,
        "FIRE": 2,
        "WATER": 1,
        "ELECTRIC": 1,
        "GRASS": 1,
        "ICE": 2,
        "FIGHTING": 0.5,
        "POISON": 1,
        "GROUND": 0.5,
        "FLYING": 2,
        "PSYCHIC": 1,
        "BUG": 2,
        "ROCK": 1,
        "GHOST": 1,
        "DRAGON": 1
    },
    "GHOST": {
        "NORMAL": 0,
        "FIRE": 1,
        "WATER": 1,
        "ELECTRIC": 1,
        "GRASS": 1,
        "ICE": 1,
        "FIGHTING": 1,
        "POISON": 1,
        "GROUND": 1,
        "FLYING": 1,
        "PSYCHIC": 0,
        "BUG": 1,
        "ROCK": 1,
        "GHOST": 2,
        "DRAGON": 1
    },
    "DRAGON": {
        "NORMAL": 1,
        "FIRE": 1,
        "WATER": 1,
        "ELECTRIC": 1,
        "GRASS": 1,
        "ICE": 1,
        "FIGHTING": 1,
        "POISON": 1,
        "GROUND": 1,
        "FLYING": 1,
        "PSYCHIC": 1,
        "BUG": 1,
        "ROCK": 1,
        "GHOST": 1,
        "DRAGON": 2
    }
}


def apply_type_advantage(attacker, defender):
    applied_attack_value = attacker["attacks"][0]["damage"]

    attacker_type = attacker["type"]
    defender_type = defender["type"]

    type_advantage_lookup = TYPE_ADVANTAGE[attacker_type][defender_type]
    applied_attack_value *= type_advantage_lookup

    return applied_attack_value

def calculate_damage(attacker, defender):
    attack_value = int(apply_type_advantage(attacker, defender))
    defender_hp = defender["hp"]

    result = defender_hp - attack_value

    print(f"{attacker['name']} used {attacker['attacks'][0]['name']}!")
    print(f"It does {attack_value} damage!")

    if int(result) <= 0:
        print(f"{defender['name']} fainted!")
        return True
    else:
        print(f"{result} HP left.")
        return False

def parse_card_data(data):
    attacks = data["attacks"]

    parsed_card = {
        "name": data["name"],
        "type": data["types"][0].upper(),
        "hp": int(data["hp"]),
        "attacks": attacks
    }

    return parsed_card


def _main():
    with open(CARD_JSON) as file:
        data = json.load(file)

        card_1_data = data[0]
        card_2_data = data[1]

        game_card_1 = parse_card_data(card_1_data)
        game_card_2 = parse_card_data(card_2_data)

    print(f"{game_card_1['name']} vs {game_card_2['name']}!")
    print(f"{game_card_2['name']} has {game_card_2['hp']} HP.")

    calculate_damage(game_card_1, game_card_2)\

_main()