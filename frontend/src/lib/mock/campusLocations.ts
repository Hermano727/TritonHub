export type CampusLocation = {
  code: string;
  name: string;
  x: number;
  y: number;
  lat: number;
  lng: number;
};

export const campusLocations: CampusLocation[] = [
  { code: "MUIR", name: "Muir College", x: 220, y: 170, lat: 32.8784, lng: -117.2416 },
  { code: "CENTR", name: "Center Hall", x: 420, y: 240, lat: 32.8801, lng: -117.2340 },
  {
    code: "WLH",
    name: "Warren Lecture Hall",
    x: 640,
    y: 180,
    lat: 32.8825,
    lng: -117.2349,
  },
  { code: "GEISEL", name: "Geisel Library", x: 390, y: 210, lat: 32.8810, lng: -117.2378 },
  { code: "UTC", name: "UTC / Off Campus", x: 760, y: 60, lat: 32.8709, lng: -117.2104 },
];
