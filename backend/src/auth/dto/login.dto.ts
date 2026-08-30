import { IsEmail, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'manager@demo' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  // require_tld: false — the demo accounts are `manager@demo` / `clerk@demo`,
  // which are valid addresses on an internal domain. Demanding a dotted TLD here
  // would make every seeded credential unusable.
  @IsEmail({ require_tld: false }, { message: 'That email address does not look valid.' })
  email!: string;

  @ApiProperty({ example: 'Demo1234!' })
  @IsString()
  @MinLength(1, { message: 'Enter your password.' })
  password!: string;
}
