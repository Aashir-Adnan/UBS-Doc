import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useAuth } from "../authStore";
import { fetchUserUrdds } from "../../../state/orgSlice";
// Resolves the acting user's URDD from Redux org state. On first mount (or when
// the email changes) it dispatches fetchUserUrdds to populate the store.
//
// Returns:
//   status : 'idle' | 'loading' | 'ready' | 'pending' | 'error'
//   urdd   : number | null   (the active org's URDD id)
//   urdds  : array of all user URDDs
//   activeOrg : the full URDD object for the active selection
//   error  : string | null
//   refetch: () => void
export function useActingUrdd() {
  const { user } = useAuth();
  const email = user?.email || null;
  const dispatch = useDispatch();

  const {
    urdds,
    activeUrdd,
    status: orgStatus,
    error,
  } = useSelector((s) => s.org);

  useEffect(() => {
    if (email && (orgStatus === "idle" || orgStatus === "error")) {
      dispatch(fetchUserUrdds(email));
    }
  }, [email, orgStatus, dispatch]);

  const refetch = () => {
    if (email) dispatch(fetchUserUrdds(email));
  };

  // Map org slice status to the legacy status contract
  let status;
  if (!email) {
    status = "idle";
  } else if (orgStatus === "loading") {
    status = "loading";
  } else if (orgStatus === "error") {
    status = "error";
  } else if (orgStatus === "ready" && urdds.length === 0) {
    status = "pending"; // no URDDs = not provisioned
  } else if (orgStatus === "ready") {
    status = "ready";
  } else {
    status = "idle";
  }

  const activeOrg = urdds.find((u) => u.urdd_id === activeUrdd) || null;

  return {
    status,
    urdd: activeUrdd,
    urdds,
    activeOrg,
    me: user,
    error,
    refetch,
  };
}
