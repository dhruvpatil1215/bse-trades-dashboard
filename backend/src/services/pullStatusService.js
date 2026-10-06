let pullInProgress = false;

const isPullInProgress = () => pullInProgress;

const setPullInProgress = (value) => {
  pullInProgress = value;
};

module.exports = {
  isPullInProgress,
  setPullInProgress,
};
