import { catalog } from "./catalog";

const vi = Object.fromEntries(Object.entries(catalog).map(([key, value]) => [key, value.vi]));

export default vi;
