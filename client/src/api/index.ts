export const api = {
  playlist: ({ queryKey }: any) => {
    const [_, directory] = queryKey;
    return fetch(`./api/playlist?dir=${directory}`).then((res) => res.json());
  },
};
