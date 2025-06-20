module.exports = async function(context, req) {
  context.res = { body: { message: "Hello from API!" } };
};
