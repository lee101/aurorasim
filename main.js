import * as THREE from 'three';

const vertexShader = `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;

varying vec2 vUv;

#define PI 3.14159265359
#define CLOUD_STEPS 32

const vec3 CLOUD_BOX_MIN = vec3(-9.5, 0.5, -11.5);
const vec3 CLOUD_BOX_MAX = vec3(9.5, 1.45, 1.2);

float saturate(float x) {
    return clamp(x, 0.0, 1.0);
}

mat2 rot2(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
}

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(i + vec3(1.0, 1.0, 1.0));

    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);
    float nxy0 = mix(nx00, nx10, f.y);
    float nxy1 = mix(nx01, nx11, f.y);

    return mix(nxy0, nxy1, f.z);
}

float fbm2(vec2 p) {
    float sum = 0.0;
    float amp = 0.55;
    for (int i = 0; i < 4; i++) {
        sum += noise2(p) * amp;
        p = rot2(0.45) * p * 2.02 + vec2(11.3, -7.1);
        amp *= 0.5;
    }
    return sum / 1.03125;
}

float billow3(vec3 p) {
    float sum = 0.0;
    float amp = 0.6;
    float norm = 0.0;

    for (int i = 0; i < 3; i++) {
        float n = noise3(p);
        sum += (1.0 - abs(n * 2.0 - 1.0)) * amp;
        norm += amp;
        p = p * 2.04 + vec3(17.2, 9.1, -13.7);
        amp *= 0.5;
    }

    return sum / norm;
}

vec3 getSkyGradient(vec3 rd) {
    float up = saturate(rd.y * 0.5 + 0.5);
    vec3 horizon = vec3(0.03, 0.08, 0.16);
    vec3 mid = vec3(0.01, 0.04, 0.11);
    vec3 zenith = vec3(0.0, 0.01, 0.04);

    vec3 sky = mix(horizon, mid, smoothstep(0.08, 0.45, up));
    sky = mix(sky, zenith, smoothstep(0.45, 1.0, up));

    float moonGlow = pow(max(dot(rd, normalize(vec3(-0.32, 0.68, -0.44))), 0.0), 56.0);
    sky += vec3(0.12, 0.15, 0.2) * moonGlow;

    return sky;
}

vec3 stars(vec3 rd, float time) {
    vec3 col = vec3(0.0);
    vec2 sphereUv = vec2(atan(rd.z, rd.x) / (2.0 * PI), acos(clamp(rd.y, -1.0, 1.0)) / PI);

    for (int i = 0; i < 3; i++) {
        float scale = 95.0 + float(i) * 60.0;
        vec2 st = sphereUv * scale;
        vec2 id = floor(st);
        vec2 f = fract(st) - 0.5;

        float gate = hash12(id + float(i) * 19.7);
        if (gate > 0.992) {
            float twinkle = sin(time * (2.0 + hash12(id + 4.2) * 3.5) + gate * 20.0) * 0.35 + 0.65;
            float d = length(f);
            float star = smoothstep(0.06, 0.0, d) * twinkle;
            vec3 tint = mix(vec3(1.0, 0.95, 0.86), vec3(0.72, 0.82, 1.0), hash12(id + 8.3));
            col += tint * star * (0.7 + float(i) * 0.2);
        }
    }

    return col * smoothstep(-0.12, 0.15, rd.y);
}

float auroraLayer(vec3 rd, float time, float seed, float height, float thickness) {
    float forward = smoothstep(-0.05, 0.25, -rd.z);
    float heightMask = smoothstep(height - thickness, height - thickness * 0.25, rd.y) *
        (1.0 - smoothstep(height + thickness, height + thickness * 1.8, rd.y));

    float curtainCoord = rd.x / max(0.18, 0.55 + rd.y);
    float sweep = sin(curtainCoord * (3.0 + seed) + time * (0.18 + seed * 0.02) + seed * 7.0) * 0.11;
    float ridge = fbm2(vec2(curtainCoord * (1.4 + seed * 0.2) - time * 0.05, 3.0 + seed)) * 0.22;
    float rays = sin(curtainCoord * (28.0 + seed * 4.0) + ridge * 9.0) * 0.5 + 0.5;
    rays = pow(rays, 5.0);

    float band = 1.0 - smoothstep(0.0, thickness * 1.7, abs(rd.y - height - sweep - ridge));
    float breakup = smoothstep(0.38, 0.82, fbm2(vec2(curtainCoord * 0.7 + seed * 3.4, time * 0.03 + seed)));

    return forward * heightMask * band * breakup * (0.35 + rays * 0.95);
}

vec3 auroraColor(vec3 rd, float time) {
    float layerA = auroraLayer(rd, time, 0.0, 0.12, 0.19);
    float layerB = auroraLayer(rd, time * 0.92, 1.7, 0.2, 0.16);
    float layerC = auroraLayer(rd, time * 1.08, 2.9, 0.31, 0.13);

    float intensity = layerA + layerB * 0.9 + layerC * 0.7;
    float vertical = saturate((rd.y + 0.05) * 1.6);

    vec3 low = vec3(0.08, 0.95, 0.45);
    vec3 mid = vec3(0.18, 0.88, 0.74);
    vec3 high = vec3(0.48, 0.55, 1.0);
    vec3 edge = vec3(0.92, 0.38, 0.88);

    vec3 col = mix(low, mid, smoothstep(0.08, 0.28, vertical));
    col = mix(col, high, smoothstep(0.22, 0.5, vertical));
    col = mix(col, edge, smoothstep(0.44, 0.68, vertical));

    float veil = fbm2(vec2(rd.x * 12.0 - time * 0.08, rd.y * 5.0 + 1.2));
    col *= intensity * (0.65 + veil * 0.8);

    return col;
}

vec2 rayBox(vec3 ro, vec3 rd, vec3 boxMin, vec3 boxMax) {
    vec3 invDir = 1.0 / rd;
    vec3 t0 = (boxMin - ro) * invDir;
    vec3 t1 = (boxMax - ro) * invDir;
    vec3 tMin = min(t0, t1);
    vec3 tMax = max(t0, t1);

    float nearT = max(max(tMin.x, tMin.y), tMin.z);
    float farT = min(min(tMax.x, tMax.y), tMax.z);

    return vec2(nearT, farT);
}

float cloudDensity(vec3 p, float time) {
    float height01 = saturate((p.y - CLOUD_BOX_MIN.y) / (CLOUD_BOX_MAX.y - CLOUD_BOX_MIN.y));
    float verticalEnvelope = smoothstep(0.0, 0.08, height01) *
        (1.0 - smoothstep(0.74, 1.0, height01));

    vec3 wind = normalize(vec3(0.95, 0.0, 0.31));
    vec2 drift = wind.xz * time * 0.28;

    float roll = noise2(
        vec2(
            dot(p.xz, wind.xz),
            dot(p.xz, vec2(-wind.z, wind.x)) * 0.55
        ) * vec2(0.17, 0.11) + drift * 0.55
    );
    float clumps = noise2(p.xz * 0.055 + drift * 0.18 + vec2(6.5, -8.2));
    float coverage = smoothstep(0.5, 0.88, roll + (1.0 - height01) * 0.18);
    coverage *= smoothstep(0.44, 0.76, clumps + roll * 0.2);

    vec3 q = p;
    q.xz += drift;
    q.x *= mix(0.48, 0.92, height01);
    q.z *= mix(0.6, 0.96, height01);
    q.y *= 1.28;

    float base = billow3(q * 0.42 + vec3(0.0, height01 * 0.6, 0.0));
    float pillars = billow3(vec3(q.x * 0.24, q.y * 1.7, q.z * 0.24) + vec3(4.2, 0.0, -2.4));
    float detail = noise3(q * 1.8 - wind * time * 0.15 + vec3(3.8, 1.2, -4.6));

    float density = mix(base, pillars, 0.32) + detail * 0.1;
    float threshold = mix(0.58, 0.82, height01);
    density = smoothstep(threshold, 1.02, density);
    density *= verticalEnvelope * coverage * mix(1.15, 0.55, height01);

    return density;
}

float sampleCloudLight(vec3 p, vec3 lightDir, float time) {
    float probeA = cloudDensity(p + lightDir * 0.45, time);
    float probeB = cloudDensity(p + vec3(0.0, 0.2, 0.0), time);
    return saturate(1.0 - probeA * 0.9 - probeB * 0.3);
}

vec4 marchClouds(vec3 ro, vec3 rd, vec3 aurora, float time) {
    vec2 hit = rayBox(ro, rd, CLOUD_BOX_MIN, CLOUD_BOX_MAX);
    if (hit.x > hit.y || hit.y < 0.0) {
        return vec4(0.0, 0.0, 0.0, 1.0);
    }

    float t0 = max(hit.x, 0.0);
    float t1 = hit.y;
    float stepSize = (t1 - t0) / float(CLOUD_STEPS);
    float jitter = hash12(gl_FragCoord.xy + time * 0.17);
    float t = t0 + stepSize * jitter;

    vec3 lightDir = normalize(vec3(-0.32, 0.72, -0.48));
    vec3 accum = vec3(0.0);
    float transmittance = 1.0;

    for (int i = 0; i < CLOUD_STEPS; i++) {
        vec3 pos = ro + rd * t;
        float density = cloudDensity(pos, time);

        if (density > 0.01) {
            float height01 = saturate((pos.y - CLOUD_BOX_MIN.y) / (CLOUD_BOX_MAX.y - CLOUD_BOX_MIN.y));
            float light = sampleCloudLight(pos, lightDir, time);
            float forwardScatter = pow(max(dot(rd, lightDir), 0.0), 8.0);

            vec3 baseCol = mix(vec3(0.14, 0.17, 0.22), vec3(0.88, 0.91, 0.96), light * light);
            baseCol *= mix(0.86, 1.04, 1.0 - height01);
            baseCol += aurora * (0.08 + (1.0 - light) * 0.22);
            baseCol += vec3(0.16, 0.18, 0.22) * forwardScatter * (1.0 - light);

            float extinction = density * stepSize * 1.2;
            float scatter = density * stepSize * 0.58;

            accum += transmittance * baseCol * scatter;
            transmittance *= exp(-extinction);

            if (transmittance < 0.02) {
                break;
            }
        }

        t += stepSize;
    }

    return vec4(accum, transmittance);
}

float landscapeMask(vec3 rd) {
    if (rd.y > 0.08) {
        return 0.0;
    }

    float horizonX = rd.x / max(0.25, -rd.z + 0.65);
    float ridge = -0.035;
    ridge += (fbm2(vec2(horizonX * 1.1, 1.3)) - 0.5) * 0.14;
    ridge += (fbm2(vec2(horizonX * 3.4, -2.1)) - 0.5) * 0.045;

    return 1.0 - smoothstep(0.0, 0.015, rd.y - ridge);
}

vec3 tonemap(vec3 col) {
    col = max(col, 0.0);
    col = col / (col + vec3(1.0));
    return pow(col, vec3(0.95));
}

void main() {
    vec2 uv = vUv;
    vec2 screen = uv * 2.0 - 1.0;
    screen.x *= uResolution.x / uResolution.y;

    float yaw = (uMouse.x - 0.5) * 0.3;
    float pitch = (uMouse.y - 0.5) * 0.12;

    vec3 ro = vec3(0.0, 0.28, 3.8);
    ro.xz = rot2(yaw) * ro.xz;

    vec3 target = vec3(0.0, 0.72 + pitch, -1.2);
    target.xz = rot2(yaw) * target.xz;

    vec3 forward = normalize(target - ro);
    vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
    vec3 up = normalize(cross(right, forward));
    vec3 rd = normalize(forward + screen.x * right * 1.05 + screen.y * up);

    vec3 sky = getSkyGradient(rd);
    sky += stars(rd, uTime);

    vec3 aurora = auroraColor(rd, uTime);
    vec3 background = sky + aurora;

    vec4 clouds = marchClouds(ro, rd, aurora, uTime);
    vec3 col = background * clouds.a + clouds.rgb;

    float ground = landscapeMask(rd);
    col = mix(col, vec3(0.01, 0.015, 0.02), ground);

    float vignette = 1.0 - dot(uv - 0.5, uv - 0.5) * 0.85;
    col *= vignette;

    gl_FragColor = vec4(tonemap(col), 1.0);
}
`;

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const uniforms = {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) }
};

const geometry = new THREE.PlaneGeometry(2, 2);
const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms
});

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

const clock = new THREE.Clock();
let lockedTime = null;

function render() {
    uniforms.uTime.value = lockedTime === null ? clock.getElapsedTime() : lockedTime;
    renderer.render(scene, camera);
}

function animate() {
    render();
    requestAnimationFrame(animate);
}

document.addEventListener('mousemove', (event) => {
    uniforms.uMouse.value.x = event.clientX / window.innerWidth;
    uniforms.uMouse.value.y = 1.0 - event.clientY / window.innerHeight;
});

window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    render();
});

window.scene = scene;
window.uniforms = uniforms;
window.renderer = renderer;
window.setShaderTime = (time) => {
    lockedTime = time;
    uniforms.uTime.value = time;
    renderer.render(scene, camera);
};
window.resumeShaderAnimation = () => {
    lockedTime = null;
    clock.getElapsedTime();
};

animate();

console.log('Aurora cloud volume initialized');
