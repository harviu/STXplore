export function indexById(features, getId) {
    const m = new Map();
    for (const f of features) {
        m.set(getId(f), f);
    }
    return m;
}