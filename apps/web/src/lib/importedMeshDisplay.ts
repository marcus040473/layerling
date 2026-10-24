import * as THREE from "three";
import { MeshBVH, type SerializedBVH } from "three-mesh-bvh";
import type { WorkplaneShape } from "@/types/layerling";

type ImportedMesh = NonNullable<WorkplaneShape["importedMesh"]>;

/** The raycasting index of an imported mesh, as the viewport builds it (enableAcceleratedMeshPicking). */
export const IMPORTED_MESH_BVH_OPTIONS = { targetLeafSize: 12 } as const;

/** Normals for every corner, the lowest point on the plate: how a shape's mesh is drawn. */
export function putGeometryOnBase(geometry: THREE.BufferGeometry, preserveNormals = false) {
  if (!preserveNormals || !geometry.getAttribute("normal")) {
    geometry.computeVertexNormals();
  }
  geometry.computeBoundingBox();
  const minY = geometry.boundingBox?.min.y ?? 0;
  geometry.translate(0, -minY, 0);
  return geometry;
}

/**
 * The view's geometry of an imported mesh (WorkplaneViewport's getImportedMeshCache). Its own
 * normals when it brings them; without, putGeometryOnBase works them out.
 */
export function buildImportedMeshGeometry(mesh: ImportedMesh) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
  const hasNormals = Boolean(mesh.normals && mesh.normals.length === mesh.positions.length);
  if (hasNormals && mesh.normals) {
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(mesh.normals, 3));
  }
  return putGeometryOnBase(geometry, hasNormals);
}

/**
 * That geometry and its raycasting index, worked out in the geometry worker for a mesh it has just
 * made, so the page only has to put them together. Built by the same code as on the page, from
 * the same numbers: the same geometry comes out.
 */
export type PreparedImportedMeshDisplay = {
  position: Float32Array;
  normal: Float32Array;
  box: [number, number, number, number, number, number];
  bvh: SerializedBVH;
};

export function prepareImportedMeshDisplay(mesh: ImportedMesh): { display: PreparedImportedMeshDisplay; transfer: ArrayBuffer[] } {
  const geometry = buildImportedMeshGeometry(mesh);
  const box = geometry.boundingBox ?? new THREE.Box3();
  const position = geometry.getAttribute("position").array as Float32Array;
  const normal = geometry.getAttribute("normal").array as Float32Array;
  // Built before the index exists, as on the page; the BVH adds it.
  const bvh = MeshBVH.serialize(new MeshBVH(geometry, IMPORTED_MESH_BVH_OPTIONS), { cloneBuffers: false });
  const transfer = [position.buffer, normal.buffer, ...bvh.roots, ...(bvh.index ? [bvh.index.buffer] : [])] as ArrayBuffer[];
  return {
    display: { position, normal, box: [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z], bvh },
    transfer: Array.from(new Set(transfer)),
  };
}

/**
 * Kept by the mesh's position list: the geometry is made from its positions and normals alone, and
 * a copy of the mesh with something added (its asset id after an import) keeps both lists.
 */
const preparedDisplays = new WeakMap<object, { display: PreparedImportedMeshDisplay; normals: number[] | undefined }>();
const preparedTrees = new WeakMap<THREE.BufferGeometry, SerializedBVH>();

/** Keeps what the worker prepared for a mesh until the view draws it. */
export function rememberPreparedDisplay(mesh: ImportedMesh, display: PreparedImportedMeshDisplay) {
  preparedDisplays.set(mesh.positions, { display, normals: mesh.normals });
}

/** The view's geometry from what the worker prepared, or null when nothing was. Used once. */
export function takePreparedImportedMeshGeometry(mesh: ImportedMesh): THREE.BufferGeometry | null {
  const prepared = preparedDisplays.get(mesh.positions);
  if (!prepared || prepared.normals !== mesh.normals) return null;
  preparedDisplays.delete(mesh.positions);
  const { display } = prepared;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(display.position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(display.normal, 3));
  const [minX, minY, minZ, maxX, maxY, maxZ] = display.box;
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
  preparedTrees.set(geometry, display.bvh);
  return geometry;
}

/**
 * The raycasting index for a geometry: the one the worker built for exactly this geometry, or a new
 * one. Only ever asked where the page would build it, so nothing else changes.
 */
export function computeImportedBoundsTree(geometry: THREE.BufferGeometry) {
  const prepared = preparedTrees.get(geometry);
  const target = geometry as THREE.BufferGeometry & { boundsTree?: MeshBVH };
  if (prepared && !geometry.getIndex()) {
    preparedTrees.delete(geometry);
    target.boundsTree = MeshBVH.deserialize(prepared, geometry);
    return;
  }
  target.boundsTree = new MeshBVH(geometry, IMPORTED_MESH_BVH_OPTIONS);
}
