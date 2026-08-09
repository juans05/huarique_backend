import { SetMetadata } from '@nestjs/common';
import { PlaceTeamRole } from '../../modules/team/entities/place-team-member.entity';

export const REQUIRES_PLACE_ROLE_KEY = 'requiresPlaceRole';
export const RequiresPlaceRole = (role: PlaceTeamRole) => SetMetadata(REQUIRES_PLACE_ROLE_KEY, role);
