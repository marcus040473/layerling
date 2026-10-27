import * as THREE from "three";
import type { ThreeState } from "@/components/workplane/ViewportOverlays";
import { RENDER_LAYER_SHAPES } from "@/components/workplane/viewportPicking";

/** What drawing one frame needs: the main view's state, or the second view's camera on the same scene. */
export type FrameState = Pick<ThreeState, "renderer" | "scene" | "camera" | "shapeRecords" | "sectionPlane">;

// The cut a hole makes in a body is drawn from depth textures rather than from a
// boolean. A hole fragment lies inside a body when it falls between the body's
// near and its far depth at that pixel, and a body fragment lies inside a hole
// the same way; four depth textures carry those bounds. Nothing runs on the CPU
// for it, so the preview keeps up with a shape while it is being dragged, and no
// result has to be cached or dropped when a gesture starts.
const CUT_PREVIEW_COLOR = 0x30363a;
const CUT_PREVIEW_OPACITY = 0.34;
// Window depth is not linear, so a bias in window units opens a gap where the cut
// meets the surface that grows as the view is pulled back. The band is widened by it
// rather than narrowed, so a hole flush with a face stays visible - the cutter pads
// by 0.05 the same way - and the bias only has to be big enough to break a tie.
const CUT_PREVIEW_DEPTH_BIAS = 1e-7;

type CutPreviewResources = {
  bodiesNear: THREE.WebGLRenderTarget;
  bodiesFar: THREE.WebGLRenderTarget;
  frontDepth: THREE.MeshBasicMaterial;
  backDepth: THREE.MeshBasicMaterial;
  // The hole shaded where it lies inside a body: what is going to be cut out,
  // drawn on the hole itself. Nothing has to know the shape of either body - only
  // whether a fragment sits between the near and the far depth of the other one.
  ink: THREE.ShaderMaterial;
  width: number;
  height: number;
};

// Each renderer has its own: the second view's window draws with a WebGL context of its own,
// and a size shared by both would make each frame throw the other's away.
const cutPreviewResourcesByRenderer = new WeakMap<THREE.WebGLRenderer, CutPreviewResources>();

function cutPreviewInkMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    // Both sides, so the far wall of a hole that goes right through fills the cut.
    // The stencil keeps one layer per pixel, so the two walls cannot add up to a
    // darker ring.
    side: THREE.DoubleSide,
    stencilWrite: true,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilRef: 1,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    stencilZPass: THREE.ReplaceStencilOp,
    uniforms: {
      nearDepth: { value: null },
      farDepth: { value: null },
      resolution: { value: new THREE.Vector2(1, 1) },
      // Written straight into the frame, so the tint keeps the values it was
      // given instead of being converted twice.
      tint: { value: new THREE.Color().setHex(CUT_PREVIEW_COLOR, THREE.LinearSRGBColorSpace) },
      opacity: { value: CUT_PREVIEW_OPACITY },
      bias: { value: CUT_PREVIEW_DEPTH_BIAS },
    },
    vertexShader: [
      "void main() {",
      "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform sampler2D nearDepth;",
      "uniform sampler2D farDepth;",
      "uniform vec2 resolution;",
      "uniform vec3 tint;",
      "uniform float opacity;",
      "uniform float bias;",
      "void main() {",
      "  // Both sides are window-space depth, so they compare directly.",
      "  float depth = gl_FragCoord.z;",
      "  vec2 uv = gl_FragCoord.xy / resolution;",
      "  float near = texture2D(nearDepth, uv).r;",
      "  float far = texture2D(farDepth, uv).r;",
      "  if (depth < near - bias || depth > far + bias) {",
      "    discard;",
      "  }",
      "  gl_FragColor = vec4(tint, opacity);",
      "}",
    ].join("\n"),
  });
}

function cutPreviewDepthTarget(width: number, height: number) {
  const depthTexture = new THREE.DepthTexture(width, height);
  depthTexture.format = THREE.DepthFormat;
  depthTexture.type = THREE.UnsignedIntType;
  const target = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    stencilBuffer: false,
    depthTexture,
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  return target;
}

export function disposeCutPreviewResources(renderer: THREE.WebGLRenderer) {
  const resources = cutPreviewResourcesByRenderer.get(renderer);
  if (!resources) {
    return;
  }
  [resources.bodiesNear, resources.bodiesFar].forEach((target) =>
    target.dispose(),
  );
  [
    resources.frontDepth,
    resources.backDepth,
    resources.ink,
  ].forEach((material) => material.dispose());
  cutPreviewResourcesByRenderer.delete(renderer);
}

function cutPreviewResourcesFor(renderer: THREE.WebGLRenderer, width: number, height: number) {
  const cached = cutPreviewResourcesByRenderer.get(renderer);
  if (cached && cached.width === width && cached.height === height) {
    return cached;
  }
  disposeCutPreviewResources(renderer);
  const resources: CutPreviewResources = {
    bodiesNear: cutPreviewDepthTarget(width, height),
    bodiesFar: cutPreviewDepthTarget(width, height),
    frontDepth: new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
      depthFunc: THREE.LessDepth,
      side: THREE.FrontSide,
    }),
    backDepth: new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
      depthFunc: THREE.LessDepth,
      side: THREE.BackSide,
    }),
    ink: cutPreviewInkMaterial(),
    width,
    height,
  };
  cutPreviewResourcesByRenderer.set(renderer, resources);
  return resources;
}

function drawCutPreviews(state: FrameState) {
  const bodies: THREE.Object3D[] = [];
  const holes: THREE.Object3D[] = [];
  state.shapeRecords.forEach((record) => {
    const object = record.object;
    if (!object || record.shape.hidden || !object.visible) {
      return;
    }
    if (record.shape.hole) {
      holes.push(object);
    } else {
      bodies.push(object);
    }
  });
  if (bodies.length === 0 || holes.length === 0) {
    return;
  }

  const renderer = state.renderer;
  const scene = state.scene;
  const camera = state.camera;
  const frameTarget = renderer.getRenderTarget();
  const size = frameTarget
    ? new THREE.Vector2(frameTarget.width, frameTarget.height)
    : renderer.getDrawingBufferSize(new THREE.Vector2());
  const resources = cutPreviewResourcesFor(renderer, size.x, size.y);

  const shapes = [...bodies, ...holes];
  const wasVisible = new Map(shapes.map((object) => [object, object.visible] as const));
  const previousAutoClear = renderer.autoClear;
  const previousOverride = scene.overrideMaterial;
  const previousBackground = scene.background;
  const previousMask = camera.layers.mask;

  const renderSet = (visible: THREE.Object3D[]) => {
    const wanted = new Set(visible);
    shapes.forEach((object) => {
      object.visible = wanted.has(object);
    });
  };

  try {
    renderer.autoClear = false;
    camera.layers.set(RENDER_LAYER_SHAPES);
    // A scene background is repainted by every render() call, and this renders
    // the scene four more times; left alone it would wipe the frame.
    scene.background = null;

    // The section plane clips per material, and these are the preview's own: without
    // it the depth textures keep the geometry that was cut away, and the ink lands in
    // the removed half. Where the plane is gone the depth reads 1.0, which discards
    // the ink there by itself.
    const sectionPlane = state.sectionPlane ?? null;
    for (const material of [resources.frontDepth, resources.backDepth]) {
      if ((material.clippingPlanes?.[0] ?? null) !== sectionPlane) {
        material.clippingPlanes = sectionPlane ? [sectionPlane] : null;
        material.needsUpdate = true;
      }
    }

    const depthPass = (
      visible: THREE.Object3D[],
      material: THREE.Material,
      target: THREE.WebGLRenderTarget,
    ) => {
      renderSet(visible);
      renderer.setRenderTarget(target);
      renderer.clear(true, true, false);
      scene.overrideMaterial = material;
      renderer.render(scene, camera);
    };

    depthPass(bodies, resources.frontDepth, resources.bodiesNear);
    depthPass(bodies, resources.backDepth, resources.bodiesFar);

    // The hole is drawn once, over the frame, and shaded where it lies inside a
    // body. The stencil decides which of its fragments gets a pixel: one layer, so
    // the shading stays even wherever the hole turns back on itself.
    resources.ink.uniforms.nearDepth.value = resources.bodiesNear.depthTexture;
    resources.ink.uniforms.farDepth.value = resources.bodiesFar.depthTexture;
    (resources.ink.uniforms.resolution.value as THREE.Vector2).set(
      resources.width,
      resources.height,
    );
    renderSet(holes);
    renderer.setRenderTarget(frameTarget);
    renderer.clear(false, false, true);
    scene.overrideMaterial = resources.ink;
    renderer.render(scene, camera);
  } finally {
    shapes.forEach((object) => {
      object.visible = wasVisible.get(object) ?? true;
    });
    scene.overrideMaterial = previousOverride;
    scene.background = previousBackground;
    camera.layers.mask = previousMask;
    renderer.autoClear = previousAutoClear;
    renderer.setRenderTarget(frameTarget);
  }
}

const plateNormal = new THREE.Vector3();
const plateCenter = new THREE.Vector3();
const plateToCamera = new THREE.Vector3();

/**
 * The plate is see-through and drawn before the see-through bodies, so a body above it is not laid over by
 * it (viewportScene.ts). Seen from below the plate is in front of them instead, and drawn first it hid them
 * completely (#894). From its back side the plate is drawn after them, so they show through it, faded.
 */
function orderPlatesForView(scene: THREE.Scene, camera: THREE.Camera) {
  scene.traverse((object) => {
    if (object.name !== "WorkplaneBase" && object.name !== "WorkplaneBaseReference") return;
    plateNormal.set(0, 0, 1).transformDirection(object.matrixWorld);
    object.getWorldPosition(plateCenter);
    const behind = plateToCamera.copy(camera.position).sub(plateCenter).dot(plateNormal) < 0;
    object.renderOrder = behind ? 10 : -10;
  });
}

export function renderFrame(state: FrameState) {
  orderPlatesForView(state.scene, state.camera);
  state.renderer.render(state.scene, state.camera);
  drawCutPreviews(state);
}
