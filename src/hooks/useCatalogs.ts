import { useQuery } from "@tanstack/react-query";
import { getCatalogs, type CatalogTrack, type CatalogCar } from "@/lib/api";
import { withRequestId } from "@/lib/api/errors";
import { toCanonicalSimApiKey } from "@/lib/sim";

export type UseCatalogsResult = {
  tracks: CatalogTrack[];
  cars: CatalogCar[];
  loading: boolean;
  error: string | null;
  retry: () => void;
};

export function useCatalogs(sim: string | null): UseCatalogsResult {
  const canonicalSim = toCanonicalSimApiKey(sim);
  const enabled = canonicalSim != null;

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["catalogs", canonicalSim],
    queryFn: async () => {
      if (!canonicalSim) throw new Error("Invalid simulator");
      const data = await getCatalogs(canonicalSim);
      const tracksList = Array.isArray(data.tracks) ? data.tracks : [];
      const carsList = Array.isArray(data.cars) ? data.cars : [];
      return { tracks: tracksList, cars: carsList };
    },
    enabled,
  });

  const retry = () => {
    void refetch();
  };

  if (!enabled) {
    return {
      tracks: [],
      cars: [],
      loading: false,
      error: null,
      retry,
    };
  }

  return {
    tracks: data?.tracks ?? [],
    cars: data?.cars ?? [],
    loading: isPending,
    error: error
      ? withRequestId("Failed to load track/car list.", error)
      : null,
    retry,
  };
}
