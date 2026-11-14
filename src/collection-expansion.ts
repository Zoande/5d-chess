import {type Collectible,type Rarity} from './collection.ts'

const make=(type:Collectible['type'],rows:[string,string,Rarity,string][],monthly?:'solar'|'lunar'):Collectible[]=>rows.map(([motif,name,rarity,description])=>({id:`${type}-${motif}`,type,motif,name,rarity,description,price:({common:160,uncommon:320,rare:700,epic:1600,legendary:4000,mythic:12000})[rarity],monthly}))
export const EXPANSION_ITEMS:Collectible[]=[
 ...make('skin',[
  ['sundial','Sundial','uncommon','Brushed brass with engraved hour marks.'],
  ['heliograph','Heliograph','rare','Mirrored gold shutters and sunlit enamel.'],
  ['emberglass','Emberglass','epic','Molten amber held in a dark glass shell.'],
  ['coronation','Coronation','legendary','A ceremonial mantle of gold and scarlet.'],
  ['supernova','Supernova','mythic','A stellar core bursting through its shell.']
 ],'solar'),
 ...make('skin',[
  ['moonstone','Moonstone','uncommon','Pearlescent stone and a silver lunar sash.'],
  ['selenite','Selenite','rare','Striated crystal plates under a moonlit glaze.'],
  ['nightbloom','Nightbloom','epic','Silver vines and flowers opening after dark.'],
  ['penumbra','Penumbra','legendary','Violet eclipse windows in blackened silver.'],
  ['eventide','Eventide','mythic','An iridescent sky caught between silver ribs.']
 ],'lunar'),
 ...make('icon',[
  ['solar-moth','Solar Moth','uncommon','A gilded moth with a sun upon its wings.'],
  ['astrolabe','Astrolabe','rare','An instrument for navigating possible futures.'],
  ['firebird','Firebird','epic','A radiant bird rising from a solar crown.'],
  ['sun-lion','Sun Lion','legendary','The guardian of the daylight court.'],
  ['dyson','Dyson Heart','mythic','A tiny star suspended inside a celestial engine.']
 ],'solar'),
 ...make('icon',[
  ['lunar-hare','Lunar Hare','uncommon','A moonlit hare beneath a crescent.'],
  ['moon-jelly','Moon Jelly','rare','A luminous traveler in the midnight sea.'],
  ['nocturne','Nocturne','epic','An owl watching the silver horizon.'],
  ['moon-dragon','Moon Dragon','legendary','A silver dragon coiled around a dark moon.'],
  ['eclipse-gate','Eclipse Gate','mythic','The doorway between the sun and its shadow.']
 ],'lunar'),
 ...make('frame',[
  ['copper-orbit','Copper Orbit','common','Twin copper rails with a traveling glint.'],
  ['verdant','Verdant Wreath','uncommon','Animated leaves around a braided stem.'],
  ['tideline','Tideline','rare','Two currents crossing beneath sea glass.'],
  ['arcade','Arcade','rare','Stepped neon corners and drifting pixels.'],
  ['clock-ring','Clock Ring','epic','A brass gear with independently turning hands.'],
  ['frost-crown','Frost Crown','epic','A halo of crystalline points and falling sparks.'],
  ['royal-seal','Royal Seal','legendary','A crowned medallion with orbiting jewels.'],
  ['plasma','Plasma Coil','legendary','A double helix of charged violet light.'],
  ['seraph','Seraph Wings','legendary','Six luminous wings with a slow golden pulse.'],
  ['rift-halo','Rift Halo','mythic','A broken halo circling a violet singularity.']
 ]),
 ...make('frame',[
  ['solar-corona','Solar Corona','rare','Golden rays erupt around an orbiting star.'],
  ['ember-wings','Ember Wings','epic','Ember feathers drifting around a solar seal.'],
  ['eclipse-crown','Eclipse Crown','mythic','A moving eclipse beneath a double crown.']
 ],'solar'),
 ...make('frame',[
  ['lunar-tide','Lunar Tide','rare','Moon phases float along a silver current.'],
  ['night-garden','Night Garden','legendary','Silver blossoms opening on a violet vine.']
 ],'lunar'),
 ...make('shape',[
  ['spire','Spire','common','Tall tapered bodies with architectural collars.'],
  ['citadel','Citadel','uncommon','Broad stone shoulders and stepped foundations.'],
  ['regency','Regency','rare','Slender turned stems and generous curved crowns.'],
  ['origami','Origami','rare','Folded angular silhouettes with crisp profiles.'],
  ['lantern','Lantern Court','epic','Open lantern bodies held on delicate feet.'],
  ['nautilus','Nautilus','epic','Sweeping shells and curved oceanic pedestals.'],
  ['monolith','Monolith','legendary','Severe geometric columns with cutout centers.'],
  ['baroque','Baroque','legendary','Sculpted shoulders and double-scroll bases.'],
  ['sentinel','Sentinel','legendary','Armored chessmen with broad protective collars.'],
  ['levitation','Levitation','mythic','Separated floating crowns above sculpted stems.']
 ]),
 ...make('shape',[
  ['sun-temple','Sun Temple','common','Flared sun-temple columns and stepped plinths.'],
  ['phoenix-court','Phoenix Court','epic','Winged shoulders rising from sweeping bases.'],
  ['coronal','Coronal','legendary','Solar crowns and pierced ceremonial bodies.']
 ],'solar'),
 ...make('shape',[
  ['crescent','Crescent Court','uncommon','Crescent shoulders and crescent-cut bases.'],
  ['observatory','Observatory','rare','Domed crowns and slender observatory towers.']
 ],'lunar')
]
