import { catalog } from "./catalog";

const en = Object.fromEntries(Object.entries(catalog).map(([key, value]) => [key, value.en]));

export default en;
