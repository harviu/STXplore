import comm from "../../data/Chicago-Data/Boundries/CommAreas_20250306/chicagoComm.json";
import beat from "../../data/Chicago-Data/Boundries/PoliceBeatDec2012_20250225/beats.json";
import district from "../../data/Chicago-Data/Boundries/PoliceDistrictDec2012_20250128/district.json";

export const BOUNDARY_GEO = {
    community: comm,
    beat: beat,
    district: district,
};

export function getBoundaryId(layer, feature) {
    if (layer === "community") return String(feature.properties.area_num_1);
    if (layer === "beat") return String(feature.properties.beat_num);
    return String(feature.properties.dist_num);
}

export function getBoundaryLabel(layer, feature) {
    if (layer === "community") {
        return `${feature.properties.community} (Community Area ${feature.properties.area_num_1})`;
    }
    if (layer === "beat") {
        return `Beat ${feature.properties.beat_num} — District ${feature.properties.district}`;
    }
    return `District ${feature.properties.dist_label}`;
}