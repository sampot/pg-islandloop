export default {
  async fetch(request) {
    return Response.json({
      ok: true,
      name: "pg-islandloop",
      path: new URL(request.url).pathname,
    });
  },
};
