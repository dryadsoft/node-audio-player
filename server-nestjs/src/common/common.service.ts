import { Injectable } from '@nestjs/common';

@Injectable()
export class CommonService {
  test(keyword: string) {
    return console.log('common');
  }
}
