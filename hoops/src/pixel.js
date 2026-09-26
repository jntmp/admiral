import {
  DepthTexture,
  HalfFloatType,
  NearestFilter,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Renders the scene at a low resolution, then blows it up by a whole number
// so every art pixel is the same size on screen. The upscale pass also draws
// depth-based outlines and quantises colour with an ordered (Bayer) dither.
const fragmentShader = /* glsl */ `
  #include <packing>
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 lowRes;
  uniform vec2 offset;
  uniform float scale;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float levels;
  uniform float outline;

  float viewDepth(vec2 uv) {
    return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar);
  }

  float bayer4(vec2 p) {
    int x = int(mod(p.x, 4.0));
    int y = int(mod(p.y, 4.0));
    mat4 m = mat4(0.0, 12.0, 3.0, 15.0,
                  8.0, 4.0, 11.0, 7.0,
                  2.0, 14.0, 1.0, 13.0,
                  10.0, 6.0, 9.0, 5.0);
    return (m[x][y] + 0.5) / 16.0;
  }

  void main() {
    vec2 cell = floor((gl_FragCoord.xy - offset) / scale);
    vec2 texel = 1.0 / lowRes;
    vec2 uv = (cell + 0.5) * texel;
    vec3 col = texture2D(tColor, uv).rgb;

    // Darken background pixels that border something much nearer: a
    // one-pixel ink line around silhouettes that leaves thin things (the net,
    // the rim) their own colour.
    float d = viewDepth(uv);
    float n = min(
      min(viewDepth(uv + vec2(texel.x, 0.0)), viewDepth(uv - vec2(texel.x, 0.0))),
      min(viewDepth(uv + vec2(0.0, texel.y)), viewDepth(uv - vec2(0.0, texel.y)))
    );
    float edge = step(0.3 + n * 0.12, d - n);
    col *= 1.0 - outline * edge;

    col = clamp(col, 0.0, 1.0);
    col = mix(col * 12.92, 1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, col));
    col = floor(col * levels + bayer4(cell)) / levels;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const vertexShader = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export class PixelRenderer {
  constructor(renderer, { targetHeight = 240, levels = 14, outline = 0.5 } = {}) {
    this.renderer = renderer;
    this.targetHeight = targetHeight;
    this.target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthTexture: new DepthTexture(1, 1),
    });
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        lowRes: { value: new Vector2(1, 1) },
        offset: { value: new Vector2() },
        scale: { value: 1 },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 100 },
        levels: { value: levels },
        outline: { value: outline },
      },
    });
    this.quad = new FullScreenQuad(this.material);
    this.size = new Vector2(1, 1);
  }

  // width/height are CSS pixels. Returns the low-res size for the camera aspect.
  setSize(width, height, pixelRatio) {
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    const deviceW = Math.floor(width * pixelRatio);
    const deviceH = Math.floor(height * pixelRatio);
    const scale = Math.max(2, Math.round(deviceH / this.targetHeight));
    const lowW = Math.ceil(deviceW / scale);
    const lowH = Math.ceil(deviceH / scale);
    this.target.setSize(lowW, lowH);
    const u = this.material.uniforms;
    u.lowRes.value.set(lowW, lowH);
    u.scale.value = scale;
    // Centre the grid; any overhang is split evenly off both edges.
    u.offset.value.set(Math.floor((deviceW - lowW * scale) / 2), Math.floor((deviceH - lowH * scale) / 2));
    this.size.set(lowW, lowH);
    this.scale = scale;
    return this.size;
  }

  render(scene, camera) {
    const u = this.material.uniforms;
    u.cameraNear.value = camera.near;
    u.cameraFar.value = camera.far;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.quad.render(this.renderer);
  }
}
