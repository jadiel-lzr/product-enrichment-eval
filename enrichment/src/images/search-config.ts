/**
 * Brand → official website domain mapping.
 * Keys are UPPERCASE brand names as they appear in the feed.
 */
export const BRAND_DOMAINS: Readonly<Record<string, string>> = {
  'ALBERTA FERRETTI': 'albertaferretti.com',
  'ALEXANDER MCQUEEN': 'alexandermcqueen.com',
  'ALEV': 'alevimilano.com',
  'ALEVÉ': 'alevimilano.com',
  'ANTONINO VALENTI': 'antoninovalenti.com',
  'ARMARIUM': 'armarium.com',
  'AZ FACTORY': 'azfactory.com',
  'BABE & TESS': 'babeandtess.com',
  'BALMAN': 'balmain.com',
  'BALLY': 'bally.com',
  'BAZAR DELUXE': 'bazardeluxe.it',
  'BLANCHA': 'blancha.it',
  'BLUMARINE': 'blumarine.com',
  'BON TON TOYS': 'bontontoys.com',
  'BOSS HUGO BOSS': 'hugoboss.com',
  'BRANDO-LUBIAM': 'brandolubiam.it',
  'BRIONI': 'brioni.com',
  'BRUNO MANETTI': 'brunomanetti.it',
  'BURBERRY': 'burberry.com',
  'BURBURRY': 'burberry.com',
  'CB MADE IN ITALY': 'cbmadeinitaly.com',
  'CHLO': 'chloe.com',
  "CHLOE'": 'chloe.com',
  'CHLOÉ': 'chloe.com',
  // 'COURREGES': 'courreges.com', // Blocks Anthropic's crawler
  // 'COURRÈGES': 'courreges.com', // Blocks Anthropic's crawler
  'CUTLER AND GROSS': 'cutlerandgross.com',
  'DARKPARK': 'darkpark.co',
  'DESA': '1972desa.com',
  'DOLCE & GABBANA': 'dolcegabbana.com',
  'DOLCE & GABBANA JUNIOR': 'dolcegabbana.com',
  'DSQUARED2': 'dsquared2.com',
  'ERMANNO SCERVINO': 'ermannoscervino.com',
  'ERMANNO SCERVINO KIDS': 'ermannoscervino.com',
  'ETRO': 'etro.com',
  'FINAMORE': 'finamore.it',
  'FRAME': 'frame-store.com',
  'GLANSHIRT': 'slowear.com',
  'INCOTEX': 'slowear.com',
  'IRO': 'iro-paris.com',
  'ISABEL MARANT': 'isabelmarant.com',
  // 'JIL SANDER': 'jilsander.com', // Blocks Anthropic's ClaudeBot
  'KHAITE': 'khaite.com',
  "L'AGENCE": 'lagence.com',
  'LA DOUBLEJ': 'ladoublej.com',
  'LAMBERTO LOSANI': 'lambertolosani.com',
  'MACH & MACH': 'mach-mach.com',
  'MACKAGE': 'mackage.com',
  'MARANT': 'isabelmarant.com',
  'MAGDA BUTRYM': 'magdabutrym.com',
  'MARNI': 'marni.com',
  'MINI RODINI': 'minirodini.com',
  'MONTBLANC': 'montblanc.com',
  'MONTEDORO': 'slowear.com',
  'MOSCHINO': 'moschino.com',
  'MYTHS': 'myths.it',
  '(NUDE)': 'nude-fashion.com',
  'OFF WHITE': 'off---white.com',
  'PAIGE': 'paige.com',
  'PALM ANGELS': 'palmangels.com',
  'PIERRE-LOUIS MASCIA': 'pierrelouismascia.com',
  'PT01': 'pt-torino.com',
  'RABANNE': 'rabanne.com',
  'SAVE THE DUCK': 'savetheduck.com',
  'STELLA MC CARTNEY': 'stellamccartney.com',
  'STELLA MCCARTNEY': 'stellamccartney.com',
  'TAGLIATORE': 'tagliatore.com',
  'THE ATTICO': 'the-attico.com',
  'VERSACE': 'versace.com',
  'VICTORIA BECKHAM': 'victoriabeckham.com',
  'Y CHAI': 'ychai.it',
  'ZANONE': 'slowear.com',
}

/**
 * Feed supplier → website domain mapping.
 */
export const FEED_SUPPLIER_DOMAINS: Readonly<Record<string, string>> = {
  loschi: 'loschiboutique.com',
  cb_made_in_italy: 'cbmadeinitaly.com',
}

/**
 * Major multi-brand retailers — universal for all products.
 */
export const RETAILER_DOMAINS: readonly string[] = [
  'farfetch.com',
  'ssense.com',
  'net-a-porter.com',
  'mytheresa.com',
  'matchesfashion.com',
  'italist.com',
  'thedoublef.com',
  'giglio.com',
  'vitkac.com',
  'cettire.com',
  'lyst.com',
  'flannels.com',
  'endclothing.com',
  'antonioli.eu',
  'fashionclinic.com',
  'gebnegozionline.com',
  'montiboutique.com',
  'gaudenziboutique.com',
  'childrensalon.com',
  'childsplayclothing.com',
  'kidsatelier.com',
  'kids21.com',
  'luksusbaby.kr',
  'smoochiebaby.com',
  'junioredition.com',
  'fourkids.com',
  'stadtlandkind.ch',
  'mochikids.com',
]

export const ITALIAN_COLOR_MAP: Readonly<Record<string, string>> = {
  NERO: 'black',
  BIANCO: 'white',
  ROSSO: 'red',
  VERDE: 'green',
  AZZURRO: 'light blue',
  BLU: 'blue',
  GRIGIO: 'grey',
  BEIGE: 'beige',
  ORO: 'gold',
  AVORIO: 'ivory',
  MARRONE: 'brown',
}

export const BRAND_CORRECTIONS: Readonly<Record<string, string>> = {
  BURBURRY: 'Burberry',
  BALMAN: 'Balmain',
  MARANT: 'Isabel Marant',
  'STELLA MC CARTNEY': 'Stella McCartney',
}

export function translateColor(color: string): string {
  if (!color) return ''

  return color
    .split(/[/,]/)
    .map((part) => {
      const trimmed = part.trim().toUpperCase()
      return ITALIAN_COLOR_MAP[trimmed] ?? part.trim()
    })
    .join('/')
}

export function correctBrand(brand: string): string {
  const upper = brand.toUpperCase()
  return BRAND_CORRECTIONS[upper] ?? brand
}

// getTier1Domains and getTier2Domains removed — single unrestricted search now used.
// BRAND_DOMAINS and FEED_SUPPLIER_DOMAINS are still used by the adapter to build
// search hints (e.g. "also try site:dolcegabbana.com").
