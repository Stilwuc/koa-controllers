import * as joi from 'joi';

export const UserSchema = joi
  .object({
    userName: joi.string().min(6).description('username').required(),
  })
  .id('UserSchema');
