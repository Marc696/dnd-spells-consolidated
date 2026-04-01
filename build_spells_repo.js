#!/usr/bin/env node
/**
 * ============================================================
 * D&D 5e Spell Database Consolidation Script
 * ============================================================
 *
 * Run this locally with: node build_spells_repo.js
 *
 * It will:
 * 1. Load dice data from Marc696/dados_efecto
 * 2. Load spells from Jtachan/DnD-5.5-Spells-ES (best Spanish source)
 * 3. Load spells from Open5e API (English SRD, fills gaps)
 * 4. Load spells from dnd5eapi.co (more English spells)
 * 5. Add Warlock Invocations
 * 6. Merge everything, deduplicate, and output a single JSON
 *
 * Output: spells_consolidated.json (pretty) + spells_consolidated.min.json
 *
 * Upload spells_consolidated.min.json to your GitHub repo.
 */

const fs = require("fs");

const normalize = (str) => {
    if (!str) return "";
    return str
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ");
};

const extractDice = (text) => {
    const t = String(text || "");
    if (!t) return "";
    // Match dice patterns: 1d8, 2d6+3, 8d6, 10d6+40, etc.
    const matches =
        t.match(
            /\b\d{1,2}\s*d\s*\d{1,3}(?:\s*[+\-]\s*\d{1,3})?\b/gi
        ) || [];
    const cleaned = matches
        .map((m) => m.replace(/\s+/g, "").toLowerCase())
        .filter(Boolean);
    const seen = new Set();
    for (const m of cleaned) {
        if (!seen.has(m)) return m;
    }
    return "";
};

// Extended English -> Spanish name mapping for deduplication and dice lookup
const enToEs = {
    "acid splash": "salpicadura de acido",
    "blade ward": "guardia de filo",
    "chill touch": "toque gelido",
    "dancing lights": "luces danzantes",
    "eldritch blast": "estallido arcano",
    "fire bolt": "rayo de fuego",
    friends: "amistad",
    guidance: "guia",
    light: "luz",
    "mage hand": "mano de mago",
    mending: "reparar",
    message: "mensaje",
    "minor illusion": "ilusion menor",
    "poison spray": "rociada de veneno",
    prestidigitation: "prestidigitacion",
    "produce flame": "produccion de llama",
    "ray of frost": "rayo de escarcha",
    resistance: "resistencia",
    "sacred flame": "llama sagrada",
    shillelagh: "shillelagh",
    "shocking grasp": "sacudida electrica",
    "spare the dying": "estabilizar",
    thaumaturgy: "taumaturgia",
    "thorn whip": "latigo de espinas",
    "toll the dead": "campana de difuntos",
    "true strike": "golpe certero",
    "vicious mockery": "burla cruel",
    "word of radiance": "palabra de fulgor",
    druidcraft: "druidismo",
    alarm: "alarma",
    "burning hands": "manos ardientes",
    "charm person": "hechizar persona",
    "chromatic orb": "orbe cromatico",
    "comprehend languages": "entender idiomas",
    "cure wounds": "curar heridas",
    "detect magic": "detectar magia",
    "disguise self": "disfrazarse",
    "dissonant whispers": "susurros disonantes",
    "faerie fire": "fuego feerico",
    "guiding bolt": "rayo guia",
    "healing word": "palabra de sanacion",
    "hellish rebuke": "reprension infernal",
    hex: "maleficio",
    "inflict wounds": "infligir heridas",
    "mage armor": "armadura de mago",
    "magic missile": "misil magico",
    shield: "escudo",
    sleep: "dormir",
    thunderwave: "onda atronadora",
    bless: "bendecir",
    bane: "perdicion",
    "ray of sickness": "rayo de dolencia",
    grease: "grasa",
    "speak with animals": "hablar con los animales",
    "witch bolt": "virote encantado",
    "misty step": "paso neblinoso",
    "scorching ray": "rayo abrasador",
    shatter: "estallido",
    "hold person": "retener persona",
    invisibility: "invisibilidad",
    "spider climb": "trepar por paredes",
    darkness: "oscuridad",
    "cloud of daggers": "nube de dagas",
    "spiritual weapon": "arma espiritual",
    "phantasmal force": "fuerza fantasmal",
    "calm emotions": "calmar emociones",
    "lesser restoration": "restablecimiento menor",
    "prayer of healing": "plegaria de sanacion",
    "flaming sphere": "esfera flamigera",
    moonbeam: "rayo de luna",
    "ray of enfeeblement": "rayo de enfequecimiento",
    aid: "auxilio",
    "animal messenger": "sentido animal",
    fireball: "bola de fuego",
    "lightning bolt": "relampago",
    counterspell: "contraconjuro",
    "dispel magic": "disipar magia",
    fly: "volar",
    haste: "acelerar",
    slow: "enlentecer",
    fear: "miedo",
    "bestow curse": "lanzar maldicion",
    "hypnotic pattern": "patron hipnotico",
    "animate dead": "animar a los muertos",
    "spirit guardians": "espiritus guardianes",
    "mass healing word": "palabra de sanacion en masa",
    blink: "intermitencia",
    "plant growth": "crecimiento vegetal",
    banishment: "desterrar",
    "greater invisibility": "invisibilidad mayor",
    blight: "marchitar",
    confusion: "confusion",
    "wall of fire": "muro de fuego",
    "dominate beast": "dominar bestia",
    "dimension door": "puerta dimensional",
    "cone of cold": "cono de frio",
    "dominate person": "dominar persona",
    "hold monster": "retener monstruo",
    "mass cure wounds": "curar heridas en masa",
    "flame strike": "golpe de llamas",
    "commune with nature": "comunion con la naturaleza",
    scrying: "escudrinar",
    seeming: "similitud",
    disintegrate: "desintegrar",
    heal: "sanar",
    "chain lightning": "relampago en cadena",
    "circle of death": "circulo de muerte",
    "finger of death": "dedo de la muerte",
    regenerate: "regenerar",
    "fire storm": "tormenta de fuego",
    earthquake: "terremoto",
    wish: "deseo",
    "power word kill": "palabra de poder matar",
    "time stop": "parar el tiempo",
};

// Build reverse map (es -> en) for dedup checks
const esToEn = {};
for (const [en, es] of Object.entries(enToEs)) {
    esToEn[normalize(es)] = normalize(en);
}

async function main() {
    const allSpells = new Map(); // normalized name -> spell object

    // Helper: check if a spell name (normalized) is already present, considering translations
    const isDuplicate = (normalizedName) => {
        if (allSpells.has(normalizedName)) return true;
        // Check if the English version is already there via Spanish name
        const esEquiv = enToEs[normalizedName];
        if (esEquiv && allSpells.has(normalize(esEquiv))) return true;
        // Check if the Spanish version is already there via English name
        const enEquiv = esToEn[normalizedName];
        if (enEquiv && allSpells.has(enEquiv)) return true;
        return false;
    };

    // ========== STEP 1: Load dice data ==========
    console.log("=== Step 1: Loading dice data ===");
    const diceMap = new Map();

    try {
        const res = await fetch(
            "https://raw.githubusercontent.com/Marc696/dados_efecto/main/dados%20de%20efecto"
        );
        const text = await res.text();
        const sections = text.split(/_{5,}/);

        for (const section of sections) {
            const trimmed = section.trim();
            if (!trimmed.startsWith("[")) continue;
            try {
                const data = JSON.parse(trimmed);
                for (const item of data) {
                    const dice =
                        item?.dados_efecto ?? item?.dados_de_efecto ?? "";
                    const nameEs =
                        item?.nombre_espanol ?? item?.nombre_español ?? "";
                    const nameGeneric = item?.nombre ?? item?.name ?? "";

                    if (dice && dice.trim() !== "" && dice !== "N/A") {
                        if (nameEs) diceMap.set(normalize(nameEs), dice);
                        if (nameGeneric && nameGeneric !== nameEs)
                            diceMap.set(normalize(nameGeneric), dice);
                    }
                }
            } catch (e) {
                /* ignore parse errors */
            }
        }

        // Enrich diceMap with English name aliases
        for (const [en, es] of Object.entries(enToEs)) {
            const esValue = diceMap.get(normalize(es));
            if (esValue) {
                diceMap.set(normalize(en), esValue);
            }
        }

        console.log(`  Dice entries loaded: ${diceMap.size}`);
    } catch (e) {
        console.error("  Failed to load dice data:", e.message);
    }

    // ========== STEP 2: Load Jtachan (primary Spanish source) ==========
    console.log("\n=== Step 2: Loading Jtachan DnD-5.5-Spells-ES ===");
    try {
        const res = await fetch(
            "https://raw.githubusercontent.com/Jtachan/DnD-5.5-Spells-ES/main/spells/ed5_5/all.json"
        );
        const data = await res.json();
        console.log(`  Raw count: ${data.length}`);

        for (const spell of data) {
            const name = spell.nombre || spell.name || "";
            if (!name) continue;

            const normalizedName = normalize(name);
            const dice = diceMap.get(normalizedName) || "";

            const rangeRaw = spell.alcance || spell.range || "Personal";
            const range = Array.isArray(rangeRaw) ? rangeRaw[0] : rangeRaw;

            const descRaw = spell.descripcion || spell.description || "";
            const description = Array.isArray(descRaw)
                ? descRaw[0] || ""
                : descRaw;
            const descText = Array.isArray(descRaw)
                ? descRaw.join(" ")
                : descRaw;

            const compRaw = spell.componentes || spell.components || "V, S";
            const components = Array.isArray(compRaw)
                ? compRaw.join(", ")
                : compRaw;

            allSpells.set(normalizedName, {
                name,
                level: spell.nivel ?? spell.level ?? 0,
                school: spell.escuela || spell.school || "Desconocida",
                castingTime:
                    spell.tiempo_de_lanzamiento ||
                    spell.casting_time ||
                    "1 acción",
                range,
                components,
                duration:
                    spell.duracion || spell.duration || "Instantáneo",
                description,
                classes: spell.clases || spell.classes || [],
                source: "DnD-5.5-Spells-ES",
                damage: dice || extractDice(descText),
            });
        }
        console.log(`  After step 2: ${allSpells.size} total spells`);
    } catch (e) {
        console.error("  Jtachan failed:", e.message);
    }

    // ========== STEP 3: Load Open5e (English SRD) ==========
    console.log("\n=== Step 3: Loading Open5e API ===");
    try {
        let url =
            "https://api.open5e.com/v1/spells/?limit=500&document__slug=wotc-srd&format=json";
        let page = 1;
        let added = 0;

        while (url) {
            console.log(`  Page ${page}...`);
            const res = await fetch(url);
            const data = await res.json();
            const spellList = data.results || [];

            for (const spell of spellList) {
                const name = spell.name || "";
                const normalizedName = normalize(name);

                if (isDuplicate(normalizedName)) continue;

                const dice = diceMap.get(normalizedName) || "";
                const descText = Array.isArray(spell.desc)
                    ? spell.desc.join(" ")
                    : spell.desc || "";

                allSpells.set(normalizedName, {
                    name,
                    level: spell.spell_level ?? 0,
                    school: spell.school || "Unknown",
                    castingTime: spell.casting_time || "1 action",
                    range: spell.range || "Self",
                    components: spell.components || "V, S",
                    duration: spell.duration || "Instantaneous",
                    description: descText,
                    classes: spell.dnd_class
                        ? String(spell.dnd_class)
                              .split(",")
                              .map((c) => c.trim())
                        : [],
                    source: "open5e",
                    damage: dice || extractDice(descText),
                });
                added++;
            }

            url = data.next || null;
            page++;
        }
        console.log(`  Added ${added} new spells from Open5e`);
        console.log(`  Running total: ${allSpells.size}`);
    } catch (e) {
        console.error("  Open5e failed:", e.message);
    }

    // ========== STEP 4: Load dnd5eapi.co ==========
    console.log("\n=== Step 4: Loading dnd5eapi.co ===");
    try {
        const res = await fetch("https://www.dnd5eapi.co/api/spells");
        const data = await res.json();
        const spellRefs = data.results || [];
        console.log(`  Spell refs: ${spellRefs.length}`);

        let added = 0;
        let skipped = 0;
        for (const ref of spellRefs) {
            const normalizedName = normalize(ref.name);
            if (isDuplicate(normalizedName)) {
                skipped++;
                continue;
            }

            try {
                const spellRes = await fetch(
                    `https://www.dnd5eapi.co${ref.url}`
                );
                const spell = await spellRes.json();

                const dice = diceMap.get(normalizedName) || "";
                const descText = spell.desc?.join(" ") || "";

                allSpells.set(normalizedName, {
                    name: spell.name || ref.name,
                    level: spell.level || 0,
                    school: spell.school?.name || "Unknown",
                    castingTime: spell.casting_time || "1 action",
                    range: spell.range || "Self",
                    components: spell.components?.join(", ") || "V, S",
                    duration: spell.duration || "Instantaneous",
                    description: spell.desc?.join("<br><br>") || "",
                    classes: spell.classes?.map((c) => c.name) || [],
                    source: "dnd5eapi.co",
                    damage: dice || extractDice(descText),
                });
                added++;
            } catch (e) {
                // skip individual failures silently
            }
        }
        console.log(`  Added ${added}, skipped ${skipped} duplicates`);
        console.log(`  Running total: ${allSpells.size}`);
    } catch (e) {
        console.error("  dnd5eapi failed:", e.message);
    }

    // ========== STEP 5: Add Warlock Invocations ==========
    console.log("\n=== Step 5: Adding Warlock Invocations ===");
    const warlockInvocations = [
        {
            name: "Armadura de las Sombras",
            level: 0,
            school: "Invocación",
            castingTime: "Acción",
            range: "Personal",
            components: "V, S",
            duration: "Permanente",
            description:
                "Puedes lanzar armadura de mago sobre ti mismo a voluntad, sin gastar un espacio de conjuro ni componentes materiales.",
            classes: ["Brujo"],
            source: "Invocación de Brujo",
            damage: "",
        },
        {
            name: "Visión del Diablo",
            level: 0,
            school: "Invocación",
            castingTime: "Acción",
            range: "Personal",
            components: "V, S",
            duration: "Permanente",
            description:
                "Puedes ver normalmente en la oscuridad, tanto mágica como no mágica, hasta una distancia de 120 pies.",
            classes: ["Brujo"],
            source: "Invocación de Brujo",
            damage: "",
        },
        {
            name: "Lanza Sobrenatural",
            level: 0,
            school: "Invocación",
            castingTime: "Acción",
            range: "Personal",
            components: "V, S",
            duration: "Permanente",
            description:
                "Una vez en cada uno de tus turnos cuando golpees a una criatura con tu ataque de Explosión Sobrenatural, puedes empujar a la criatura hasta 10 pies lejos de ti.",
            classes: ["Brujo"],
            source: "Invocación de Brujo",
            damage: "",
        },
        {
            name: "Mirada de Dos Mentes",
            level: 0,
            school: "Invocación",
            castingTime: "Acción",
            range: "Personal",
            components: "V, S",
            duration: "Permanente",
            description:
                "Puedes usar tu acción para tocar a un humanoide voluntario y percibir a través de sus sentidos hasta el final de tu próximo turno.",
            classes: ["Brujo"],
            source: "Invocación de Brujo",
            damage: "",
        },
        {
            name: "Máscara de Muchas Caras",
            level: 0,
            school: "Invocación",
            castingTime: "Acción",
            range: "Personal",
            components: "V, S",
            duration: "Permanente",
            description:
                "Puedes lanzar disfrazarse a voluntad, sin gastar un espacio de conjuro.",
            classes: ["Brujo"],
            source: "Invocación de Brujo",
            damage: "",
        },
        {
            name: "Sed de la Hoja",
            level: 0,
            school: "Invocación",
            castingTime: "Acción",
            range: "Personal",
            components: "V, S",
            duration: "Permanente",
            description:
                "Puedes crear un arma de pacto que toma la forma de un arma cuerpo a cuerpo de tu elección.",
            classes: ["Brujo"],
            source: "Invocación de Brujo",
            damage: "",
        },
        {
            name: "Libro de Secretos Antiguos",
            level: 0,
            school: "Invocación",
            castingTime: "Acción",
            range: "Personal",
            components: "V, S",
            duration: "Permanente",
            description:
                "Tu patrón te da un grimorio llamado Libro de las Sombras. Puedes lanzar rituales de cualquier clase desde este libro.",
            classes: ["Brujo"],
            source: "Invocación de Brujo",
            damage: "",
        },
        {
            name: "Explosión Agonizante",
            level: 0,
            school: "Invocación",
            castingTime: "Acción",
            range: "Personal",
            components: "V, S",
            duration: "Permanente",
            description:
                "Cuando lances explosión sobrenatural, añade tu modificador de Carisma al daño que inflige en caso de impacto.",
            classes: ["Brujo"],
            source: "Invocación de Brujo",
            damage: "",
        },
    ];

    let invAdded = 0;
    for (const inv of warlockInvocations) {
        const key = normalize(inv.name);
        if (!allSpells.has(key)) {
            allSpells.set(key, inv);
            invAdded++;
        }
    }
    console.log(`  Added ${invAdded} invocations`);

    // ========== STEP 6: Sort and output ==========
    const sorted = Array.from(allSpells.values()).sort((a, b) => {
        if (a.level !== b.level) return a.level - b.level;
        return a.name.localeCompare(b.name);
    });

    const withDice = sorted.filter((s) => s.damage && s.damage.trim());

    console.log(`\n========================================`);
    console.log(`  FINAL STATS`);
    console.log(`========================================`);
    console.log(`  Total spells:      ${sorted.length}`);
    console.log(`  With dice data:    ${withDice.length}`);
    console.log(`  Without dice data: ${sorted.length - withDice.length}`);

    const bySource = {};
    for (const s of sorted) bySource[s.source] = (bySource[s.source] || 0) + 1;
    console.log(`\n  By source:`, bySource);

    const byLevel = {};
    for (const s of sorted) byLevel[s.level] = (byLevel[s.level] || 0) + 1;
    console.log(`  By level:`, byLevel);

    // Write files
    fs.writeFileSync(
        "spells_consolidated.json",
        JSON.stringify(sorted, null, 2)
    );
    fs.writeFileSync("spells_consolidated.min.json", JSON.stringify(sorted));

    const sizeKB = (
        Buffer.byteLength(JSON.stringify(sorted)) / 1024
    ).toFixed(1);
    console.log(
        `\n  Written: spells_consolidated.json (pretty)`
    );
    console.log(
        `  Written: spells_consolidated.min.json (${sizeKB} KB)`
    );
    console.log(
        `\n  Upload spells_consolidated.min.json to your GitHub repo!`
    );
}

main().catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
});
