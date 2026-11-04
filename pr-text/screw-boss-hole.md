Title: Screw boss: grouped as a hole, it cuts only its hole, the insert's pocket

## Summary

In [#1288](https://github.com/henmedia/layerling/discussions/1288) a screw boss set as a hole and grouped into a block cut the whole post: a ring went into the block with a core left standing in it, where a blind hole for a heat-set insert was wanted – the way people model their own standoffs and blocks and then cut the insert hole into them.

Set as a hole, the boss is now its hole alone: the pocket from the hole's floor (or the boss's foot, when the hole goes through) up to its top, with the lead-in chamfer at the mouth, as wide and deep as the size list sets it (M3: 4.0 mm, 6.7 mm deep). The post and the gussets play no part then. It is drawn that way in the view too, and the guide's screw boss section says so in the 15 languages that have it.

## Testing

- `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run guide`, `npm run i18n:status`
- New `tests/e2e/screwBossHole.e2e.ts` (real Manifold kernel): a 20 × 20 × 10 mm block with the M3 boss as a hole in its middle, top flush; the grouped body is the block less exactly the pocket (about 81 mm³). Without the change it loses about 415 mm³ (the post's ring).
- `tests/unit/enclosureParts.test.ts`: the pocket alone is closed, 6.7 mm deep from the top, no wider than the hole and its chamfer, with gussets set too; through when as deep as the boss; the editor builds a boss marked as a hole that way.

## Notes

- New `screwBossCavityMesh` in `lib/screwBoss.ts`; `createScrewBossGeometry` picks it for a hole. The geometry keys in `viewportShapeObjects.ts` take the hole flag for a boss, so the view redraws when it is switched.
