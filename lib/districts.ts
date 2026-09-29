export type District = {
  id: string;
  name: string;
  nameHi: string;
  west: number;
  east: number;
  south: number;
  north: number;
};

export const DISTRICTS: District[] = [
  { id: "patna", name: "Patna", nameHi: "पटना", west: 84.9, east: 85.4, south: 25.4, north: 25.8 },
  { id: "gaya", name: "Gaya", nameHi: "गया", west: 84.8, east: 85.3, south: 24.6, north: 25.1 },
  { id: "bhagalpur", name: "Bhagalpur", nameHi: "भागलपुर", west: 86.7, east: 87.3, south: 25.1, north: 25.5 },
  { id: "ranchi", name: "Ranchi", nameHi: "रांची", west: 85.1, east: 85.6, south: 23.1, north: 23.6 },
  { id: "hazaribagh", name: "Hazaribagh", nameHi: "हजारीबाग", west: 85.2, east: 85.6, south: 23.9, north: 24.2 },
  { id: "jamshedpur", name: "Jamshedpur", nameHi: "जमशेदपुर", west: 86.0, east: 86.5, south: 22.5, north: 22.9 },
  { id: "kolkata", name: "Kolkata", nameHi: "कोलकाता", west: 88.2, east: 88.5, south: 22.4, north: 22.7 },
  { id: "asansol", name: "Asansol", nameHi: "आसनसोल", west: 86.8, east: 87.2, south: 23.6, north: 23.9 },
  { id: "malda", name: "Malda", nameHi: "मालदा", west: 87.9, east: 88.3, south: 24.9, north: 25.3 },
  { id: "siliguri", name: "Siliguri", nameHi: "सिलीगुड़ी", west: 88.3, east: 88.6, south: 26.6, north: 26.9 },
  { id: "bhubaneswar", name: "Bhubaneswar", nameHi: "भुवनेश्वर", west: 85.7, east: 86.0, south: 20.15, north: 20.4 },
  { id: "cuttack", name: "Cuttack", nameHi: "कटक", west: 85.7, east: 86.2, south: 20.3, north: 20.6 },
  { id: "rourkela", name: "Rourkela", nameHi: "राउरकेला", west: 84.7, east: 85.1, south: 22.1, north: 22.4 },
  { id: "guwahati", name: "Guwahati", nameHi: "गुवाहाटी", west: 91.5, east: 91.9, south: 26.0, north: 26.3 },
  { id: "shillong", name: "Shillong", nameHi: "शिलांग", west: 91.7, east: 92.1, south: 25.4, north: 25.7 },
  { id: "agartala", name: "Agartala", nameHi: "अगरतला", west: 91.2, east: 91.5, south: 23.75, north: 23.95 },
];

export function findDistrict(name: string): District | undefined {
  const key = name.trim().toLowerCase();
  return DISTRICTS.find((district) => district.id === key || district.name.toLowerCase() === key || district.nameHi === name.trim());
}
