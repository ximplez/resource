import { httpError } from "../lib/errors.js";
import { safeJson } from "../lib/http.js";
import { stringifyForError } from "../lib/object.js";
import { buildOnePanelToken } from "./auth.js";

export class OnePanelClient {
  constructor(config) {
    this.baseURL = config.baseURL;
    this.apiKey = config.apiKey;
  }

  async findContainerByName(name) {
    const resp = await this.post("/containers/search", {
      page: 1,
      pageSize: 100,
      name,
      state: "all",
      orderBy: "name",
      order: "ascending",
      filters: "",
      excludeAppStore: false,
    });
    const items = Array.isArray(resp.data && resp.data.items) ? resp.data.items : [];
    for (const item of items) {
      if (typeof item.name === "string" && item.name.trim() === name) {
        return item;
      }
    }
    return null;
  }

  async healthCheck() {
    await this.post("/containers/search", {
      page: 1,
      pageSize: 1,
      name: "",
      state: "all",
      orderBy: "name",
      order: "ascending",
      filters: "",
      excludeAppStore: false,
    });
  }

  async upgradeContainer(name, image, forcePull) {
    if (!image) {
      throw httpError(400, "upgrade image is empty");
    }
    await this.post("/containers/upgrade", {
      name,
      image,
      forcePull,
    });
  }

  async createContainer(req) {
    await this.post("/containers", req);
  }

  async searchImageRepos() {
    const resp = await this.post("/containers/repo/search", {
      info: "",
      page: 1,
      pageSize: 100,
    });
    return Array.isArray(resp.data && resp.data.items) ? resp.data.items : [];
  }

  async createImageRepo(req) {
    await this.post("/containers/repo", req);
  }

  async updateImageRepo(req) {
    await this.post("/containers/repo/update", req);
  }

  async checkImageRepoStatus(id) {
    await this.post("/containers/repo/status", { id });
  }

  async post(path, body) {
    return await this.request("POST", path, body);
  }

  async request(method, path, body) {
    const timestamp = `${Math.floor(Date.now() / 1000)}`;
    const token = buildOnePanelToken(this.apiKey, timestamp);
    const headers = {
      "1Panel-Token": token,
      "1Panel-Timestamp": timestamp,
    };
    let requestBody = undefined;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      requestBody = JSON.stringify(body);
    }

    const resp = await fetch(this.baseURL + path, {
      method,
      headers,
      body: requestBody,
    });
    const data = await safeJson(resp);
    if (!resp.ok) {
      throw httpError(502, `1panel request failed. status=${resp.status} body=${stringifyForError(data)}`);
    }
    if (!data || data.code !== 200) {
      const code = data && data.code !== undefined ? data.code : "";
      const message = data && data.message ? data.message : stringifyForError(data);
      throw httpError(502, `1panel api error. code=${code} message=${message}`);
    }
    return data;
  }
}
