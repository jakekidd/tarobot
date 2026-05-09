import type { Card } from '../types';

// 78-card Rider-Waite-style deck. Upright meanings only (MVP).
// Meanings are intentionally short — the reading prompt does the heavy lifting.

export const TAROT_DECK: Card[] = [
  // ─── Major Arcana (0..21) ───────────────────────────
  { id: 0,  name: 'The Fool',           arcana: 'major', number: 0,  keywords: ['leap', 'beginning', 'naivety'],         upright_meaning: 'a step taken without proof of footing; the start of something whose shape is unknown.' },
  { id: 1,  name: 'The Magician',       arcana: 'major', number: 1,  keywords: ['agency', 'manifestation', 'will'],      upright_meaning: 'all the tools are present; the question is whether you will pick them up.' },
  { id: 2,  name: 'The High Priestess', arcana: 'major', number: 2,  keywords: ['intuition', 'secrets', 'inner voice'],  upright_meaning: 'something is known beneath the words; the answer is already inside.' },
  { id: 3,  name: 'The Empress',        arcana: 'major', number: 3,  keywords: ['abundance', 'nurture', 'fertility'],    upright_meaning: 'a season of growth and tending; what you feed will swell.' },
  { id: 4,  name: 'The Emperor',        arcana: 'major', number: 4,  keywords: ['structure', 'authority', 'order'],      upright_meaning: 'rules and frames; the cost of building, the comfort of walls.' },
  { id: 5,  name: 'The Hierophant',     arcana: 'major', number: 5,  keywords: ['tradition', 'institution', 'guidance'], upright_meaning: 'the path others have walked; lineage, doctrine, the weight of inherited form.' },
  { id: 6,  name: 'The Lovers',         arcana: 'major', number: 6,  keywords: ['choice', 'alignment', 'union'],         upright_meaning: 'a choice that asks who you are; alignment between heart and act.' },
  { id: 7,  name: 'The Chariot',        arcana: 'major', number: 7,  keywords: ['momentum', 'willpower', 'direction'],   upright_meaning: 'force gathered and pointed; movement won by holding opposing reins.' },
  { id: 8,  name: 'Strength',           arcana: 'major', number: 8,  keywords: ['courage', 'restraint', 'inner force'],  upright_meaning: 'the gentle hand that holds the lion still; power that does not need to roar.' },
  { id: 9,  name: 'The Hermit',         arcana: 'major', number: 9,  keywords: ['solitude', 'inner search', 'lantern'],  upright_meaning: 'a step away from the noise; the small lamp carried into the dark.' },
  { id: 10, name: 'Wheel of Fortune',   arcana: 'major', number: 10, keywords: ['cycles', 'turning', 'fate'],            upright_meaning: 'a turn is coming; what is up will descend, what is low will rise.' },
  { id: 11, name: 'Justice',            arcana: 'major', number: 11, keywords: ['accountability', 'balance', 'consequence'], upright_meaning: 'a reckoning, even-handed; the books being balanced regardless of preference.' },
  { id: 12, name: 'The Hanged Man',     arcana: 'major', number: 12, keywords: ['surrender', 'suspension', 'perspective'], upright_meaning: 'the world inverted on purpose; insight bought by stillness, by the refusal to move.' },
  { id: 13, name: 'Death',              arcana: 'major', number: 13, keywords: ['endings', 'transformation', 'release'], upright_meaning: 'something must be put down; the door does not close, it transforms.' },
  { id: 14, name: 'Temperance',         arcana: 'major', number: 14, keywords: ['synthesis', 'patience', 'blending'],    upright_meaning: 'the slow mixing; opposites brought into a single steady pour.' },
  { id: 15, name: 'The Devil',          arcana: 'major', number: 15, keywords: ['bondage', 'attachment', 'shadow'],      upright_meaning: 'chains chosen; the comfort of the cage, the part you keep feeding.' },
  { id: 16, name: 'The Tower',          arcana: 'major', number: 16, keywords: ['collapse', 'revelation', 'upheaval'],   upright_meaning: 'sudden, structural; what was built on the wrong stone comes down at once.' },
  { id: 17, name: 'The Star',           arcana: 'major', number: 17, keywords: ['hope', 'renewal', 'faith'],             upright_meaning: 'the quiet after a long storm; a small clean light returning.' },
  { id: 18, name: 'The Moon',           arcana: 'major', number: 18, keywords: ['illusion', 'dream', 'the unseen'],      upright_meaning: 'distorted shapes; what is real and what is feared wear the same face here.' },
  { id: 19, name: 'The Sun',            arcana: 'major', number: 19, keywords: ['clarity', 'vitality', 'joy'],           upright_meaning: 'unhidden, warm, named; the day arrives without ambiguity.' },
  { id: 20, name: 'Judgement',          arcana: 'major', number: 20, keywords: ['reckoning', 'awakening', 'calling'],    upright_meaning: 'a summons answered; the true name spoken aloud.' },
  { id: 21, name: 'The World',          arcana: 'major', number: 21, keywords: ['completion', 'integration', 'return'],  upright_meaning: 'the loop closes; arrival, and the readiness for the next loop.' },

  // ─── Cups (22..35) ──────────────────────────────────
  { id: 22, name: 'Ace of Cups',     arcana: 'minor', suit: 'cups', number: 1,  keywords: ['new feeling', 'opening', 'love'],          upright_meaning: 'an emotion arriving cleanly; the heart taking on water.' },
  { id: 23, name: 'Two of Cups',     arcana: 'minor', suit: 'cups', number: 2,  keywords: ['partnership', 'recognition'],              upright_meaning: 'a meeting between two; mutual seeing across a small distance.' },
  { id: 24, name: 'Three of Cups',   arcana: 'minor', suit: 'cups', number: 3,  keywords: ['celebration', 'friendship', 'communion'],  upright_meaning: 'shared joy; the table set for those who lifted you here.' },
  { id: 25, name: 'Four of Cups',    arcana: 'minor', suit: 'cups', number: 4,  keywords: ['apathy', 'missed offer', 'withdrawal'],    upright_meaning: 'the offered cup ignored; turning inward, missing what was held out.' },
  { id: 26, name: 'Five of Cups',    arcana: 'minor', suit: 'cups', number: 5,  keywords: ['grief', 'loss', 'dwelling'],               upright_meaning: 'looking at what spilled while two cups still stand behind you.' },
  { id: 27, name: 'Six of Cups',     arcana: 'minor', suit: 'cups', number: 6,  keywords: ['nostalgia', 'returning', 'innocence'],     upright_meaning: 'an old feeling revisited; sweetness from a younger version of you.' },
  { id: 28, name: 'Seven of Cups',   arcana: 'minor', suit: 'cups', number: 7,  keywords: ['fantasy', 'paralysis', 'illusion'],        upright_meaning: 'too many shimmering options; not all of them are real.' },
  { id: 29, name: 'Eight of Cups',   arcana: 'minor', suit: 'cups', number: 8,  keywords: ['leaving', 'walking away'],                 upright_meaning: 'leaving something that has gone hollow; walking off without looking back.' },
  { id: 30, name: 'Nine of Cups',    arcana: 'minor', suit: 'cups', number: 9,  keywords: ['satisfaction', 'wish'],                    upright_meaning: 'the wish granted; pleasure that names itself.' },
  { id: 31, name: 'Ten of Cups',     arcana: 'minor', suit: 'cups', number: 10, keywords: ['fulfillment', 'family', 'bliss'],          upright_meaning: 'emotional completion; the picture you would have drawn as a child.' },
  { id: 32, name: 'Page of Cups',    arcana: 'minor', suit: 'cups', number: 11, keywords: ['curious heart', 'tender messenger'],       upright_meaning: 'a soft new feeling, hesitant, holding something out.' },
  { id: 33, name: 'Knight of Cups',  arcana: 'minor', suit: 'cups', number: 12, keywords: ['romantic pursuit', 'idealistic motion'],   upright_meaning: 'a heart on a horse; the gallant, sometimes deluded, advance.' },
  { id: 34, name: 'Queen of Cups',   arcana: 'minor', suit: 'cups', number: 13, keywords: ['empathic mastery', 'depth'],               upright_meaning: 'feeling held without drowning; a deep still pool.' },
  { id: 35, name: 'King of Cups',    arcana: 'minor', suit: 'cups', number: 14, keywords: ['emotional steadiness', 'tempered feeling'], upright_meaning: 'the heart under governance; storms felt but not surrendered to.' },

  // ─── Wands (36..49) ─────────────────────────────────
  { id: 36, name: 'Ace of Wands',    arcana: 'minor', suit: 'wands', number: 1,  keywords: ['ignition', 'spark'],                       upright_meaning: 'a clean flame in the hand; the impulse to make and to begin.' },
  { id: 37, name: 'Two of Wands',    arcana: 'minor', suit: 'wands', number: 2,  keywords: ['planning', 'pre-launch'],                  upright_meaning: 'standing on the parapet with the world in your hand; deciding which way to throw yourself.' },
  { id: 38, name: 'Three of Wands',  arcana: 'minor', suit: 'wands', number: 3,  keywords: ['expansion', 'horizon'],                    upright_meaning: 'ships sent out; waiting on what you set in motion.' },
  { id: 39, name: 'Four of Wands',   arcana: 'minor', suit: 'wands', number: 4,  keywords: ['arrival', 'foundation'],                   upright_meaning: 'a celebration of the threshold reached; the first solid ground.' },
  { id: 40, name: 'Five of Wands',   arcana: 'minor', suit: 'wands', number: 5,  keywords: ['friction', 'sparring'],                    upright_meaning: 'noisy disagreement; the kind of fight that is mostly people not listening.' },
  { id: 41, name: 'Six of Wands',    arcana: 'minor', suit: 'wands', number: 6,  keywords: ['recognition', 'victory'],                  upright_meaning: 'public reward; the parade after the work nobody saw.' },
  { id: 42, name: 'Seven of Wands',  arcana: 'minor', suit: 'wands', number: 7,  keywords: ['defending', 'embattled'],                  upright_meaning: 'high ground held alone; the position you now have to keep.' },
  { id: 43, name: 'Eight of Wands',  arcana: 'minor', suit: 'wands', number: 8,  keywords: ['acceleration', 'news'],                    upright_meaning: 'sudden movement; messages, action, the held breath releasing.' },
  { id: 44, name: 'Nine of Wands',   arcana: 'minor', suit: 'wands', number: 9,  keywords: ['exhausted vigilance', 'almost done'],      upright_meaning: 'wounded but standing; the last stretch before rest.' },
  { id: 45, name: 'Ten of Wands',    arcana: 'minor', suit: 'wands', number: 10, keywords: ['burden', 'overload'],                      upright_meaning: 'too much carried; you forgot some of it was set down for you.' },
  { id: 46, name: 'Page of Wands',   arcana: 'minor', suit: 'wands', number: 11, keywords: ['eager messenger', 'fresh fire'],           upright_meaning: 'a young flame, all enthusiasm; the impulse before the discipline.' },
  { id: 47, name: 'Knight of Wands', arcana: 'minor', suit: 'wands', number: 12, keywords: ['bold motion', 'headlong'],                 upright_meaning: 'galloping, sometimes off the road; momentum that does not always check the map.' },
  { id: 48, name: 'Queen of Wands',  arcana: 'minor', suit: 'wands', number: 13, keywords: ['magnetic confidence', 'presence'],         upright_meaning: 'a warmth that gathers a room; the ease of someone who knows what they are.' },
  { id: 49, name: 'King of Wands',   arcana: 'minor', suit: 'wands', number: 14, keywords: ['visionary will', 'decisive'],              upright_meaning: 'the long view executed; vision turned into instruction.' },

  // ─── Swords (50..63) ────────────────────────────────
  { id: 50, name: 'Ace of Swords',    arcana: 'minor', suit: 'swords', number: 1,  keywords: ['clarity', 'breakthrough'],                upright_meaning: 'a single clean cut of truth; the air clearing.' },
  { id: 51, name: 'Two of Swords',    arcana: 'minor', suit: 'swords', number: 2,  keywords: ['stalemate', 'impasse'],                   upright_meaning: 'blindfolded between two crossed blades; the decision postponed by holding both.' },
  { id: 52, name: 'Three of Swords',  arcana: 'minor', suit: 'swords', number: 3,  keywords: ['heartbreak', 'painful clarity'],          upright_meaning: 'three blades in the heart, drawn precisely; truth that hurts in the right place.' },
  { id: 53, name: 'Four of Swords',   arcana: 'minor', suit: 'swords', number: 4,  keywords: ['rest', 'recovery'],                       upright_meaning: 'lying still on stone; deliberate stopping, the body reconvening.' },
  { id: 54, name: 'Five of Swords',   arcana: 'minor', suit: 'swords', number: 5,  keywords: ['pyrrhic victory', 'residue'],             upright_meaning: 'won, but the cost is on the floor; the smirk that does not feel as good as expected.' },
  { id: 55, name: 'Six of Swords',    arcana: 'minor', suit: 'swords', number: 6,  keywords: ['passage', 'transition'],                  upright_meaning: 'leaving harder water for calmer; the slow row away.' },
  { id: 56, name: 'Seven of Swords',  arcana: 'minor', suit: 'swords', number: 7,  keywords: ['strategy', 'sleight'],                    upright_meaning: 'the partial truth; the things slipped out under the arm.' },
  { id: 57, name: 'Eight of Swords',  arcana: 'minor', suit: 'swords', number: 8,  keywords: ['self-trap', 'illusion of bind'],          upright_meaning: 'bound loosely; the rope is real but the knot is not as tight as it feels.' },
  { id: 58, name: 'Nine of Swords',   arcana: 'minor', suit: 'swords', number: 9,  keywords: ['anxiety', 'rumination'],                  upright_meaning: 'the night mind; nine blades hung over a bed that should have been sleep.' },
  { id: 59, name: 'Ten of Swords',    arcana: 'minor', suit: 'swords', number: 10, keywords: ['rock bottom', 'final blow'],              upright_meaning: 'the worst already happened; the only direction left is up.' },
  { id: 60, name: 'Page of Swords',   arcana: 'minor', suit: 'swords', number: 11, keywords: ['watchful learner', 'sharp curiosity'],    upright_meaning: 'eyes scanning the field; the appetite to know cutting before it builds.' },
  { id: 61, name: 'Knight of Swords', arcana: 'minor', suit: 'swords', number: 12, keywords: ['fast attack', 'ideas in motion'],         upright_meaning: 'thought turned to charge; sometimes too fast to feel the ground.' },
  { id: 62, name: 'Queen of Swords',  arcana: 'minor', suit: 'swords', number: 13, keywords: ['incisive judgment', 'clean perception'],  upright_meaning: 'seeing exactly; the kindness of unsoftened truth.' },
  { id: 63, name: 'King of Swords',   arcana: 'minor', suit: 'swords', number: 14, keywords: ['authoritative reason', 'structured truth'], upright_meaning: 'the lawful mind; doctrine forged and held with steady hand.' },

  // ─── Pentacles (64..77) ─────────────────────────────
  { id: 64, name: 'Ace of Pentacles',    arcana: 'minor', suit: 'pentacles', number: 1,  keywords: ['new resource', 'tangible opening'],   upright_meaning: 'something solid offered; a seed coin pressed into the palm.' },
  { id: 65, name: 'Two of Pentacles',    arcana: 'minor', suit: 'pentacles', number: 2,  keywords: ['juggling', 'balance'],                upright_meaning: 'the dance between two demands; balance kept by motion.' },
  { id: 66, name: 'Three of Pentacles',  arcana: 'minor', suit: 'pentacles', number: 3,  keywords: ['collaboration', 'craft'],             upright_meaning: 'craftspeople pooled around a thing being built; competence meeting competence.' },
  { id: 67, name: 'Four of Pentacles',   arcana: 'minor', suit: 'pentacles', number: 4,  keywords: ['holding tight', 'security as grip'],  upright_meaning: 'arms closed around what you have; safety bought with stiffness.' },
  { id: 68, name: 'Five of Pentacles',   arcana: 'minor', suit: 'pentacles', number: 5,  keywords: ['lack', 'exclusion'],                  upright_meaning: 'cold outside the lit window; the warmth not yet asked for.' },
  { id: 69, name: 'Six of Pentacles',    arcana: 'minor', suit: 'pentacles', number: 6,  keywords: ['giving and receiving', 'flow'],       upright_meaning: 'measured generosity; the scales weighed before the coin moves.' },
  { id: 70, name: 'Seven of Pentacles',  arcana: 'minor', suit: 'pentacles', number: 7,  keywords: ['patient cultivation', 'pause'],       upright_meaning: 'leaning on the spade, looking at the harvest; the long wait built into the work.' },
  { id: 71, name: 'Eight of Pentacles',  arcana: 'minor', suit: 'pentacles', number: 8,  keywords: ['diligent practice', 'mastery'],       upright_meaning: 'the same motion, again, refined; mastery as repetition with attention.' },
  { id: 72, name: 'Nine of Pentacles',   arcana: 'minor', suit: 'pentacles', number: 9,  keywords: ['earned independence', 'refined comfort'], upright_meaning: 'the garden owned, the hand on the falcon; a comfort built rather than given.' },
  { id: 73, name: 'Ten of Pentacles',    arcana: 'minor', suit: 'pentacles', number: 10, keywords: ['legacy', 'generational stability'],   upright_meaning: 'the inheritance settled across rooms; stability outliving the one who built it.' },
  { id: 74, name: 'Page of Pentacles',   arcana: 'minor', suit: 'pentacles', number: 11, keywords: ['studious beginner', 'careful start'], upright_meaning: 'a young hand turning a coin over; the patience to begin slowly.' },
  { id: 75, name: 'Knight of Pentacles', arcana: 'minor', suit: 'pentacles', number: 12, keywords: ['steady progress', 'reliability'],     upright_meaning: 'the slow knight; arrives later than the others, gets there.' },
  { id: 76, name: 'Queen of Pentacles',  arcana: 'minor', suit: 'pentacles', number: 13, keywords: ['nurturing abundance', 'embodied care'], upright_meaning: 'the grounded warmth; care that keeps the kitchen running.' },
  { id: 77, name: 'King of Pentacles',   arcana: 'minor', suit: 'pentacles', number: 14, keywords: ['established prosperity', 'stewardship'], upright_meaning: 'the orchard owner; long-built wealth wielded with calm.' },
];

if (TAROT_DECK.length !== 78) {
  throw new Error(`tarot deck has ${TAROT_DECK.length} cards, expected 78`);
}
