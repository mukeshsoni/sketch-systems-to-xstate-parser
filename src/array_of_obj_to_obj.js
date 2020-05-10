// merges array of objects into a single object
export default function arrayOfObjToObj(arr) {
  return arr.reduce((acc, item) => {
    // in case of transient states, we will have { '': { target: 'abc', cond: xyz } } kind of transitions. And they need to be merged for all '' appearances
    // They need to be merged into an array
    if (Object.keys(item).includes('')) {
      return {
        ...acc,
        '': acc[''] ? acc[''].concat(item['']) : [item['']],
      };
    } else {
      return { ...acc, ...item };
    }
  }, {});
}
