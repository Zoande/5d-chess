import {type Kind} from './model.ts'

// Bodies are drawn independently of surface patterns, so any skin fits any shape.
// Cross, pointed crown, battlements, mitre, horse head and round pawn stay invariant.
const bodies:Record<string,string>={
 eternal:'M7 8h3l2 3 2-3h3l3 4-5 1v3l3 2H6l3-2v-3l-5-1Zm4 6h2v3h-2ZM4 19h16v1H4Zm2 2h12v1H6Z',
 spire:'M10 8h4l-.5 7 2 2H8.5l2-2ZM7 18h10l2 3H5Z',
 citadel:'M8 8h8v4l2 2-2 2 2 2H6l2-2-2-2 2-2ZM5 19h14v2H5Z',
 regency:'M10 8h4c-3 5-1 7 3 9H7c4-2 6-4 3-9ZM7 18q5-2 10 0l2 3H5Z',
 origami:'M9 8h6l-3 5 5 4-5 2-5-2 5-4ZM5 20l7-2 7 2v1H5Z',
 lantern:'M8 8h8l2 8-6 3-6-3Zm2 2-1 5 3 1 3-1-1-5ZM6 20h12v1H6Z',
 nautilus:'M9 8h6c-7 4 5 6 3 10H6c8-3-1-7 3-10ZM5 19q7-2 14 0l1 2H4Z',
 monolith:'M7 8h10v10H7Zm4 2v6h2v-6ZM5 19h14v2H5Z',
 baroque:'M9 8h6c-2 3 4 4 3 7-1 2-4-1-3-2-2 2-2 3 1 5H8c3-2 3-3 1-5 1 1-2 4-3 2-1-3 5-4 3-7ZM5 19q3-2 7 0 4-2 7 0v2H5Z',
 sentinel:'M7 8h10l1 3-3 2v4l3 2H6l3-2v-4-1l-3-1ZM4 20h16v1H4Z',
 levitation:'M8 9h8l-1 3H9Zm2 5h4l-1 3h-2ZM7 19h10l2 2H5Z',
 'sun-temple':'M7 8h10v2h-2v6h2v2H7v-2h2v-6H7ZM6 19h12v1h2v2H4v-2h2Z',
 'phoenix-court':'M9 8h6l5 4-5-1-1 3 5 4-7-1-7 1 5-4-1-3-5 1ZM5 20l7-2 7 2v1H5Z',
 coronal:'M8 8h8l3 5-3 5H8l-3-5Zm4 2-3 3 3 3 3-3ZM5 19h14l1 2H4Z',
 crescent:'M8 8h8c-7 1-8 7 1 10H7c3-2 5-5 1-10ZM5 19q7 4 14 0l1 3H4Z',
 observatory:'M8 8h8v2h-2v7h3v2H7v-2h3v-7H8ZM5 20h14v2H5Z'
}
const heads:Record<Kind,string>={
 K:'M11 1h2v2h2v1.5h-2V7h-2V4.5H9V3h2ZM7 6l5 2 5-2-1 5H8Z',
 Q:'M4 3l4 3 1-4 3 4 3-4 1 4 4-3-3 8H7Z',
 R:'M5 3h3v3h2V3h4v3h2V3h3v6l-3 2H8L5 9Z',
 B:'M12 1c1 2 5 4 5 6l-2 4H9L7 7c0-2 4-4 5-6Zm1 2-3 4 .8.7 3-3Z',
 N:'M8 11 10 8 6 9 4 7l3-4 4-1 2-1 1 3c4 2 4 5 4 8H8Zm2-6v1h1V5Z',
 P:'M12 2a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7ZM8 10h8v1H8Z'
}
export const SHAPE_PATHS:Record<string,Record<Kind,string>>=Object.fromEntries(Object.entries(bodies).map(([name,body])=>[name,Object.fromEntries(Object.entries(heads).map(([kind,head])=>[kind,head+body]))])) as Record<string,Record<Kind,string>>
export const shapePath=(motif:string,kind:Kind)=>SHAPE_PATHS[motif]?.[kind]
