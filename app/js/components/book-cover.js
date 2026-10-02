(() => {
  "use strict";

  const MODEL_URL = "/app/assets/models/livre_neutre.glb";
  const TARGET_SELECTOR = "[data-sonara-book-cover]";
  const RENDER_SIZE = 512;

  const cache = new Map();
  let rendererPromise = null;
  let renderQueue = Promise.resolve();

  function normalizeUrl(value) {
    try {
      return new URL(String(value || ""), window.location.href).href;
    } catch {
      return String(value || "");
    }
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Cover impossible à charger: ${url}`));
      image.src = url;
    });
  }

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || "Shader Sonara invalide.";
      gl.deleteShader(shader);
      throw new Error(message);
    }

    return shader;
  }

  function createProgram(gl) {
    const vertexShader = compileShader(
      gl,
      gl.VERTEX_SHADER,
      `
        attribute vec3 aPosition;
        attribute vec3 aNormal;

        uniform mat4 uMvp;

        varying vec3 vPosition;
        varying vec3 vNormal;

        void main() {
          vPosition = aPosition;
          vNormal = aNormal;
          gl_Position = uMvp * vec4(aPosition, 1.0);
        }
      `
    );

    const fragmentShader = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      `
        precision mediump float;

        varying vec3 vPosition;
        varying vec3 vNormal;

        uniform vec3 uBaseColor;
        uniform float uUseCover;
        uniform sampler2D uCover;

        void main() {
          vec3 normal = normalize(vNormal);
          vec3 lightDirection = normalize(vec3(-0.38, -0.30, 1.0));
          float diffuse = max(dot(normal, lightDirection), 0.0);
          float light = 0.60 + diffuse * 0.40;

          vec3 color = uBaseColor;

          if (uUseCover > 0.5 && normal.z > 0.62) {
            vec2 coverUv = vec2(
              clamp((vPosition.x + 0.1035) / 0.2070, 0.0, 1.0),
              clamp((vPosition.y - 0.0040) / 0.2970, 0.0, 1.0)
            );

            vec4 coverColor = texture2D(uCover, coverUv);
            color = coverColor.rgb;
            light = 0.78 + diffuse * 0.22;
          }

          gl_FragColor = vec4(color * light, 1.0);
        }
      `
    );

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || "Programme WebGL Sonara invalide.";
      gl.deleteProgram(program);
      throw new Error(message);
    }

    return program;
  }

  function mat4Perspective(fovRadians, aspect, near, far) {
    const out = new Float32Array(16);
    const f = 1 / Math.tan(fovRadians / 2);

    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);

    return out;
  }

  function mat4LookAt(eye, center, up) {
    let zx = eye[0] - center[0];
    let zy = eye[1] - center[1];
    let zz = eye[2] - center[2];
    let length = Math.hypot(zx, zy, zz) || 1;
    zx /= length;
    zy /= length;
    zz /= length;

    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    length = Math.hypot(xx, xy, xz) || 1;
    xx /= length;
    xy /= length;
    xz /= length;

    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    const out = new Float32Array(16);
    out[0] = xx;
    out[1] = yx;
    out[2] = zx;
    out[3] = 0;
    out[4] = xy;
    out[5] = yy;
    out[6] = zy;
    out[7] = 0;
    out[8] = xz;
    out[9] = yz;
    out[10] = zz;
    out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;

    return out;
  }

  function mat4Multiply(a, b) {
    const out = new Float32Array(16);

    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        out[column * 4 + row] =
          a[0 * 4 + row] * b[column * 4 + 0] +
          a[1 * 4 + row] * b[column * 4 + 1] +
          a[2 * 4 + row] * b[column * 4 + 2] +
          a[3 * 4 + row] * b[column * 4 + 3];
      }
    }

    return out;
  }

  function parseGlb(arrayBuffer) {
    const dataView = new DataView(arrayBuffer);

    if (dataView.getUint32(0, true) !== 0x46546c67) {
      throw new Error("Le fichier livre Sonara n'est pas un GLB valide.");
    }

    let json = null;
    let binary = null;
    let offset = 12;

    while (offset < arrayBuffer.byteLength) {
      const chunkLength = dataView.getUint32(offset, true);
      const chunkType = dataView.getUint32(offset + 4, true);
      const chunkStart = offset + 8;
      const chunkEnd = chunkStart + chunkLength;

      if (chunkType === 0x4e4f534a) {
        const bytes = new Uint8Array(arrayBuffer, chunkStart, chunkLength);
        const text = new TextDecoder().decode(bytes).replace(/\u0000+$/g, "").trim();
        json = JSON.parse(text);
      } else if (chunkType === 0x004e4942) {
        binary = arrayBuffer.slice(chunkStart, chunkEnd);
      }

      offset = chunkEnd;
    }

    if (!json || !binary) {
      throw new Error("Le GLB du livre Sonara est incomplet.");
    }

    return { json, binary };
  }

  function accessorInfo(gltf, binary, accessorIndex) {
    const accessor = gltf.accessors[accessorIndex];
    const bufferView = gltf.bufferViews[accessor.bufferView];
    const componentSizes = {
      5121: 1,
      5123: 2,
      5125: 4,
      5126: 4
    };
    const componentCounts = {
      SCALAR: 1,
      VEC2: 2,
      VEC3: 3,
      VEC4: 4
    };
    const TypedArray = {
      5121: Uint8Array,
      5123: Uint16Array,
      5125: Uint32Array,
      5126: Float32Array
    }[accessor.componentType];

    const componentSize = componentSizes[accessor.componentType];
    const componentCount = componentCounts[accessor.type];
    const elementSize = componentSize * componentCount;
    const stride = bufferView.byteStride || elementSize;
    const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);

    if (!TypedArray || !componentSize || !componentCount) {
      throw new Error("Format GLB non pris en charge par le renderer Sonara.");
    }

    if (stride === elementSize) {
      const source = new TypedArray(binary, byteOffset, accessor.count * componentCount);
      return {
        array: new TypedArray(source),
        componentType: accessor.componentType,
        componentCount,
        count: accessor.count
      };
    }

    const packed = new TypedArray(accessor.count * componentCount);
    const view = new DataView(binary);

    const readValue = (position) => {
      switch (accessor.componentType) {
        case 5121: return view.getUint8(position);
        case 5123: return view.getUint16(position, true);
        case 5125: return view.getUint32(position, true);
        case 5126: return view.getFloat32(position, true);
        default: return 0;
      }
    };

    for (let i = 0; i < accessor.count; i += 1) {
      for (let c = 0; c < componentCount; c += 1) {
        packed[i * componentCount + c] = readValue(
          byteOffset + i * stride + c * componentSize
        );
      }
    }

    return {
      array: packed,
      componentType: accessor.componentType,
      componentCount,
      count: accessor.count
    };
  }

  function getMeshColor(nodeName) {
    const name = String(nodeName || "").toLowerCase();

    if (name.includes("bloc de pages")) return [0.80, 0.78, 0.70];
    if (name.includes("tranche page")) return [0.92, 0.90, 0.82];
    if (name.includes("dos du livre")) return [0.045, 0.055, 0.075];
    if (name.includes("couverture inferieure")) return [0.045, 0.055, 0.075];
    if (name.includes("couverture superieure")) return [0.055, 0.065, 0.085];

    return [0.86, 0.84, 0.76];
  }

  async function createRenderer() {
    const canvas = document.createElement("canvas");
    canvas.width = RENDER_SIZE;
    canvas.height = RENDER_SIZE;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false
    });

    if (!gl) {
      throw new Error("WebGL indisponible pour le livre Sonara.");
    }

    const response = await fetch(MODEL_URL, { cache: "force-cache" });
    if (!response.ok) {
      throw new Error(`Livre Sonara introuvable (${response.status}).`);
    }

    const { json: gltf, binary } = parseGlb(await response.arrayBuffer());
    const program = createProgram(gl);

    const locations = {
      position: gl.getAttribLocation(program, "aPosition"),
      normal: gl.getAttribLocation(program, "aNormal"),
      mvp: gl.getUniformLocation(program, "uMvp"),
      baseColor: gl.getUniformLocation(program, "uBaseColor"),
      useCover: gl.getUniformLocation(program, "uUseCover"),
      cover: gl.getUniformLocation(program, "uCover")
    };

    const meshes = [];

    for (const node of gltf.nodes || []) {
      if (!Number.isInteger(node.mesh)) continue;

      const mesh = gltf.meshes[node.mesh];
      if (!mesh) continue;

      for (const primitive of mesh.primitives || []) {
        if (!primitive.attributes || primitive.attributes.POSITION == null || primitive.indices == null) {
          continue;
        }

        const positions = accessorInfo(gltf, binary, primitive.attributes.POSITION);
        const normals = primitive.attributes.NORMAL != null
          ? accessorInfo(gltf, binary, primitive.attributes.NORMAL)
          : null;
        const indices = accessorInfo(gltf, binary, primitive.indices);

        if (!normals) continue;

        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions.array, gl.STATIC_DRAW);

        const normalBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, normals.array, gl.STATIC_DRAW);

        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices.array, gl.STATIC_DRAW);

        const nodeName = String(node.name || mesh.name || "");

        meshes.push({
          nodeName,
          positionBuffer,
          normalBuffer,
          indexBuffer,
          indexCount: indices.count,
          indexType:
            indices.componentType === 5125
              ? gl.UNSIGNED_INT
              : indices.componentType === 5121
                ? gl.UNSIGNED_BYTE
                : gl.UNSIGNED_SHORT,
          color: getMeshColor(nodeName),
          isFrontCover: nodeName.toLowerCase().includes("couverture superieure")
        });
      }
    }

    const projection = mat4Perspective(26 * Math.PI / 180, 1, 0.01, 5);
    // Présentation produit Sonara : turn horizontal de 12° depuis la gauche,
    // caméra à hauteur de la couverture pour ne plus montrer le dessous du livre.
    const view = mat4LookAt(
      [-0.153, 0.1525, 0.72],
      [0, 0.1525, 0],
      [0, 1, 0]
    );
    const mvp = mat4Multiply(projection, view);

    const coverTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, coverTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.useProgram(program);
    gl.uniform1i(locations.cover, 0);
    gl.uniformMatrix4fv(locations.mvp, false, mvp);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);

    async function renderCover(coverUrl) {
      const coverImage = await loadImage(coverUrl);

      // Les covers Sonara restent importées dans leur format d’origine (souvent 1:1).
      // La face avant du livre est plus verticale : on fait donc un vrai « cover »
      // centré, sans jamais étirer ni écraser l’image source.
      const targetAspect = 0.2070 / 0.2970;
      const sourceWidth = coverImage.naturalWidth || coverImage.width;
      const sourceHeight = coverImage.naturalHeight || coverImage.height;
      const sourceAspect = sourceWidth / sourceHeight;
      let sx = 0;
      let sy = 0;
      let sw = sourceWidth;
      let sh = sourceHeight;

      if (sourceAspect > targetAspect) {
        sw = sourceHeight * targetAspect;
        sx = (sourceWidth - sw) / 2;
      } else if (sourceAspect < targetAspect) {
        sh = sourceWidth / targetAspect;
        sy = (sourceHeight - sh) / 2;
      }

      const coverCanvas = document.createElement("canvas");
      coverCanvas.width = 768;
      coverCanvas.height = Math.round(coverCanvas.width / targetAspect);
      const coverContext = coverCanvas.getContext("2d", { alpha: false });
      coverContext.drawImage(coverImage, sx, sy, sw, sh, 0, 0, coverCanvas.width, coverCanvas.height);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, coverTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        coverCanvas
      );

      for (const mesh of meshes) {
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
        gl.enableVertexAttribArray(locations.position);
        gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
        gl.enableVertexAttribArray(locations.normal);
        gl.vertexAttribPointer(locations.normal, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
        gl.uniform3fv(locations.baseColor, mesh.color);
        gl.uniform1f(locations.useCover, mesh.isFrontCover ? 1 : 0);

        gl.drawElements(gl.TRIANGLES, mesh.indexCount, mesh.indexType, 0);
      }

      return canvas.toDataURL("image/png");
    }

    return { renderCover };
  }

  function getRenderer() {
    if (!rendererPromise) {
      rendererPromise = createRenderer().catch((error) => {
        rendererPromise = null;
        throw error;
      });
    }

    return rendererPromise;
  }

  async function renderTarget(image) {
    if (!(image instanceof HTMLImageElement)) return;
    if (image.dataset.sonaraBookReady === "true") return;
    if (image.dataset.sonaraBookPending === "true") return;

    const source = image.dataset.sonaraBookCover || image.currentSrc || image.src || "";
    if (!source) return;

    const coverUrl = normalizeUrl(source);
    image.dataset.sonaraBookPending = "true";
    image.dataset.sonaraOriginalCover = source;

    try {
      let rendered = cache.get(coverUrl);

      if (!rendered) {
        renderQueue = renderQueue.then(async () => {
          const existing = cache.get(coverUrl);
          if (existing) return existing;

          const renderer = await getRenderer();
          const dataUrl = await renderer.renderCover(coverUrl);
          cache.set(coverUrl, dataUrl);
          return dataUrl;
        });

        rendered = await renderQueue;
      }

      image.src = rendered;
      image.dataset.sonaraBookReady = "true";
      image.classList.add("sonara-book-cover");
    } catch (error) {
      console.warn("[Sonara Book] rendu 3D indisponible, cover originale conservée.", error);
    } finally {
      delete image.dataset.sonaraBookPending;
    }
  }

  function scan(root = document) {
    if (root instanceof HTMLImageElement && root.matches(TARGET_SELECTOR)) {
      renderTarget(root);
    }

    if (root.querySelectorAll) {
      root.querySelectorAll(TARGET_SELECTOR).forEach(renderTarget);
    }
  }

  function startObserver() {
    scan(document);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            scan(node);
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  window.SonaraBookCover = {
    render: renderTarget,
    scan
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  } else {
    startObserver();
  }
})();
