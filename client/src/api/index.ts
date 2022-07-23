export const api = {
  playlist: ({ queryKey }: any) => {
    const [_, directory] = queryKey;
    return fetch(`./api/playlist?dir=${directory}`).then((res) => res.json());
  },
  search: ({ queryKey }: any) => {
    // console.log(queryKey);
    const [_, keyword] = queryKey;
    return fetch(`./api/search?keyword=${keyword}`).then((res) => res.json());
  },
};
