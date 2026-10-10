import { mount } from "svelte";
import "maplibre-gl/dist/maplibre-gl.css";
import App from "./App.svelte";
import "./app.css";

const target = document.getElementById("app");
if (!target) throw new Error("缺少应用根节点");

const app = mount(App, { target });

export default app;
