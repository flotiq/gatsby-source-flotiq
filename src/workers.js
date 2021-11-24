/**
 *
 * @param {Array} input
 * @param {int} workerLimit
 * @param {function} taskFN
 */
module.exports = async function workers(input, workerLimit = 10, taskFN) {
  let workerIndices = [... (new Array(workerLimit)).keys()]; // an array of 0,1,..,workerLimit - 1
  let results = [];
  let currentDataIdx = 0;
  await Promise.all(workerIndices.map(async function(n){
      while (input.length) {
        let localDataIdx = currentDataIdx++;
        results[localDataIdx] = await taskFN(input.shift());
      }
  }));
  return results;
}
