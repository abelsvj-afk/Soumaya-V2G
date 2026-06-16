import * as THREE from "three";

/**
 * Procedural GLSL bodies for the galaxy. Written from scratch (not copied) using
 * standard techniques: value-noise FBM for surfaces, a blackbody-ish color ramp
 * + animated granules for stars, and a Fresnel rim for planet atmospheres.
 *
 * Shared uniforms every body honors:
 *  - uTime: animation clock (set each frame in the Graph3D tick)
 *  - uBrightness: distance/pulse driven multiplier (bright far, dim+detailed near)
 *
 * If a material ever fails to compile on a device, makeNodeObject falls back to a
 * textured MeshStandardMaterial, so bodies never vanish.
 */

const NOISE = /* glsl */ `
  float hash(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float vnoise(vec3 x){
    vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                   mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                   mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y), f.z);
  }
  float fbm(vec3 p){
    float v = 0.0, a = 0.5;
    for(int i=0;i<5;i++){ v += a*vnoise(p); p *= 2.0; a *= 0.5; }
    return v;
  }
`;

const VERT = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vView;
  void main(){
    vPos = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const baseUniforms = () => ({
  uTime: { value: 0 },
  uBrightness: { value: 1 },
});

/** A sun: animated convective granules + sunspots over a hot color ramp. */
export function makeStarMaterial(hex: string): THREE.ShaderMaterial {
  const c = new THREE.Color(hex);
  const hot = c.clone().lerp(new THREE.Color("#ffffff"), 0.5);
  const cool = c.clone().lerp(new THREE.Color("#ff5a1e"), 0.5);
  return new THREE.ShaderMaterial({
    uniforms: {
      ...baseUniforms(),
      uHot: { value: new THREE.Vector3(hot.r, hot.g, hot.b) },
      uCool: { value: new THREE.Vector3(cool.r, cool.g, cool.b) },
    },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform float uTime; uniform float uBrightness;
      uniform vec3 uHot; uniform vec3 uCool;
      varying vec3 vPos; varying vec3 vNormal; varying vec3 vView;
      void main(){
        vec3 p = normalize(vPos);
        float gran = fbm(p*9.0 - uTime*0.25);
        float macro = fbm(p*3.5 + uTime*0.1);
        float t = clamp(macro*0.55 + gran*0.55, 0.0, 1.0);
        vec3 col = mix(uCool, uHot, t);
        col += pow(gran, 3.0) * 0.5;                 // bright flares
        col *= 1.0 - 0.35 * smoothstep(0.6, 0.0, gran); // cool sunspots
        float limb = pow(clamp(dot(vNormal, vView), 0.0, 1.0), 0.4); // limb darkening
        gl_FragColor = vec4(col * (0.6 + 0.4*limb) * uBrightness * 0.7, 1.0);
      }
    `,
  });
}

/** A world: FBM land/ocean + drifting clouds + a Fresnel atmospheric rim. */
export function makePlanetMaterial(hex: string): THREE.ShaderMaterial {
  const land = new THREE.Color(hex);
  const ocean = land.clone().lerp(new THREE.Color("#0a1a3a"), 0.6);
  const atmo = land.clone().lerp(new THREE.Color("#9fd0ff"), 0.7);
  return new THREE.ShaderMaterial({
    uniforms: {
      ...baseUniforms(),
      uLand: { value: new THREE.Vector3(land.r, land.g, land.b) },
      uOcean: { value: new THREE.Vector3(ocean.r, ocean.g, ocean.b) },
      uAtmo: { value: new THREE.Vector3(atmo.r, atmo.g, atmo.b) },
    },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform float uTime; uniform float uBrightness;
      uniform vec3 uLand; uniform vec3 uOcean; uniform vec3 uAtmo;
      varying vec3 vPos; varying vec3 vNormal; varying vec3 vView;
      void main(){
        vec3 p = normalize(vPos);
        float h = fbm(p*3.0)*0.7 + fbm(p*8.0)*0.3;
        vec3 albedo = mix(uOcean, uLand, smoothstep(0.48, 0.56, h));
        float clouds = smoothstep(0.55, 0.72, fbm(p*5.0 + vec3(uTime*0.03)));
        albedo = mix(albedo, vec3(1.0), clouds*0.55);
        vec3 L = normalize(vec3(0.6, 0.7, 0.5));
        float diff = clamp(dot(vNormal, L), 0.0, 1.0) * 0.85 + 0.15;
        float fres = pow(1.0 - clamp(dot(vNormal, vView), 0.0, 1.0), 3.0);
        vec3 col = albedo * diff + uAtmo * fres * 0.7;
        gl_FragColor = vec4(col * uBrightness, 1.0);
      }
    `,
  });
}
