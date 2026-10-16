export function communityAccess(userId, profile, alumniStatus) {
  const currentProfile = Boolean(userId && profile?.id === userId);
  const isSuperAdmin = currentProfile && profile.role === 'admin' && profile.status === 'verified';
  const restricted = currentProfile && profile.status === 'suspended';
  return {
    isSuperAdmin,
    verificationStatus: !userId || restricted ? null : isSuperAdmin ? 'verified' : alumniStatus,
  };
}
