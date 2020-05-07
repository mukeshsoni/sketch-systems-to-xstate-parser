// merges array of objects into a single object
export default function arrayOfObjToObj(arr) {
  return arr.reduce((acc, item) => ({ ...acc, ...item }), {});
}

