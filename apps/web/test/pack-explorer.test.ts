import test from 'node:test';
import assert from 'node:assert/strict';
import { packPreview, packExplorer } from '../src/pack-explorer.ts';
import { CHARIZARD_CHASE } from '../packs/charizard-chase.ts';
import type { CardListing, CatalogIndex, PackConfig, VariantListing } from '../../../packages/pokemon-core/src/index.ts';

function fixture() {
  const common = { variantId: 'base2|4|holofoil|unlimited', label: 'Holofoil', referenceValue: 5, tier: 'TIER_1', currency: 'USD' } as VariantListing;
  const rare = { variantId: 'base2|4|holofoil|1st-edition', label: '1st Edition Holofoil', referenceValue: 105, tier: 'TIER_4', currency: 'USD' } as VariantListing;
  const card = { cardId: 'base2-4', name: 'Jolteon', setId: 'base2', setName: 'Jungle', number: '4', headlineValue: 999, imageSmall: 'https://example.com/jolteon.png' } as CardListing;
  const index = { byVariantId: new Map([[common.variantId, { card, variant: common }], [rare.variantId, { card, variant: rare }]]), facets: {sets:[{id:'base2',name:'Jungle'}]} } as CatalogIndex;
  const pack: PackConfig = {...CHARIZARD_CHASE, id:'test-pack', name:'Test pack', priceRip:9007199254740993n, artwork: { ...CHARIZARD_CHASE.artwork, heroImageUrl: '' }, pool:[{variantId:common.variantId,weight:99},{variantId:rare.variantId,weight:1}]};
  return {index,pack,common,rare};
}

test('preview uses variant values and weights, never the card headline price', () => {
 const {index,pack}=fixture(); const p=packPreview(pack,index);
 assert.equal(p.min,5); assert.equal(p.max,105); assert.equal(p.expected,6);
 assert.equal(p.outcomes[0].probability,.99); assert.equal(p.outcomes[1].probability,.01);
 assert.equal(p.outcomes[1].label,'1st Edition Holofoil');
 assert.equal(p.totalWeight,100); assert.equal(p.price,'9007199254740993');
 assert.equal(p.buckets.reduce((n,b)=>n+b.probability,0),1);
});

test('a missing variant stays unpriced and invalidates the mean instead of borrowing another printing',()=>{
 const {index,pack,rare}=fixture();index.byVariantId.delete(rare.variantId);
 const p=packPreview(pack,index);
 assert.equal(p.outcomes[1].value,null);assert.equal(p.outcomes[1].tier,'UNPRICED');assert.equal(p.expected,null);
 assert.equal(p.buckets.find(b=>b.tier==='UNPRICED')?.probability,.01);
});

test('embedded preview JSON cannot close its script element through a pack name',()=>{
 const {index,pack}=fixture();pack.name='</script><script>alert(1)</script>';
 const html=packExplorer([pack],index);const data=html.match(/id="pack-preview-data">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(data);assert.equal(JSON.parse(data)[0].name,pack.name);assert.ok(!data.includes('<'));
 assert.ok(html.includes('&lt;/script&gt;'));
});
