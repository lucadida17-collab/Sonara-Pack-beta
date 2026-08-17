(() => {
  "use strict";

  const DB_NAME = "sonara-sync-projects-v1";
  const DB_VERSION = 1;
  const STORE_NAME = "projects";

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Base Sonara Sync indisponible."));
    });
  }

  async function run(mode, operation) {
    const database = await openDatabase();

    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        const request = operation(store);

        if (request) {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error("Opération Sonara Sync impossible."));
        } else {
          transaction.oncomplete = () => resolve(undefined);
          transaction.onerror = () => reject(transaction.error || new Error("Opération Sonara Sync impossible."));
          transaction.onabort = () => reject(transaction.error || new Error("Opération Sonara Sync annulée."));
        }
      });
    } finally {
      database.close();
    }
  }

  function normalizeProject(project = {}) {
    const now = new Date().toISOString();
    return {
      ...project,
      id: String(project.id || `sync_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`),
      name: String(project.name || "Projet Sonara Sync"),
      createdAt: project.createdAt || now,
      updatedAt: now
    };
  }

  async function save(project) {
    const normalized = normalizeProject(project);
    await run("readwrite", (store) => store.put(normalized));
    return normalized;
  }

  async function get(id) {
    if (!id) return null;
    return (await run("readonly", (store) => store.get(String(id)))) || null;
  }

  async function list() {
    const values = (await run("readonly", (store) => store.getAll())) || [];
    return values.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }

  async function remove(id) {
    if (!id) return;
    await run("readwrite", (store) => store.delete(String(id)));
  }

  window.SonaraSyncProjects = Object.freeze({
    save,
    get,
    list,
    remove
  });
})();
