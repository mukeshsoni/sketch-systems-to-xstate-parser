// omit certain properties from an Object
// the keys arguments contains array of strings which are
// the array of property names to be omitted
export default function omit(keys, obj) {
  return Object.entries(obj)
    .filter(([k, _]) => !keys.includes(k))
    .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});
}

