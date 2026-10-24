/**
 * Corners that lie on the same point of a grid, `step` apart, get the same number; the numbers
 * count up in the order the corners first come. The same as a text key of the rounded
 * coordinates, `Math.round(value / step)` joined with commas, gave in a Map - -0 counts as 0 and
 * NaN meets NaN, as in that text - without building a text per corner, which took seconds for
 * meshes of a few hundred thousand triangles.
 *
 * `ids[i]` is corner i's number, `first[n]` the first corner that got number n, `count` how many
 * numbers there are.
 */
export function weldOnGrid(vertices: ReadonlyArray<ArrayLike<number>>, step: number) {
  const total = vertices.length;
  const grid = new Float64Array(total * 3);
  for (let index = 0; index < total; index += 1) {
    const vertex = vertices[index];
    grid[index * 3] = Math.round(vertex[0] / step) + 0;
    grid[index * 3 + 1] = Math.round(vertex[1] / step) + 0;
    grid[index * 3 + 2] = Math.round(vertex[2] / step) + 0;
  }
  let capacity = 1;
  while (capacity < total * 2) capacity <<= 1;
  const mask = capacity - 1;
  const table = new Int32Array(capacity).fill(-1);
  const ids = new Int32Array(total);
  const first: number[] = [];
  for (let index = 0; index < total; index += 1) {
    const x = grid[index * 3];
    const y = grid[index * 3 + 1];
    const z = grid[index * 3 + 2];
    // MurmurHash3's finisher mixes the three, or the points of a regular mesh would pile up.
    let hash = Math.imul(hashPart(x), 0x9e3779b1);
    hash = Math.imul(hash ^ hashPart(y), 0x85ebca6b);
    hash = Math.imul(hash ^ hashPart(z), 0xc2b2ae35);
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x85ebca6b);
    hash ^= hash >>> 13;
    hash &= mask;
    for (;;) {
      const entry = table[hash];
      if (entry === -1) {
        table[hash] = index;
        ids[index] = first.length;
        first.push(index);
        break;
      }
      if (sameNumber(grid[entry * 3], x) && sameNumber(grid[entry * 3 + 1], y) && sameNumber(grid[entry * 3 + 2], z)) {
        ids[index] = ids[entry];
        break;
      }
      hash = (hash + 1) & mask;
    }
  }
  return { ids, first, count: first.length };
}

function hashPart(value: number) {
  return value !== value ? 0x7fc00000 : (value | 0) ^ ((value / 4294967296) | 0);
}

/** NaN meets NaN, as the text "NaN" meets itself. */
function sameNumber(a: number, b: number) {
  return a === b || (a !== a && b !== b);
}
