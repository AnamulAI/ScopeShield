import bakery from "../../samples/bakery.json";
import fitness from "../../samples/fitness-app.json";
import brand from "../../samples/brand-studio.json";

export interface Sample { id: string; title: string; blurb: string; clientName: string; contract: string; thread: string }
export const SAMPLES: Sample[] = [bakery, fitness, brand];
