import { Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { concat } from 'rxjs';
import { ConfigService } from 'src/app/services/config.service';
import { DatePickerComponent } from 'src/app/shared/components/date-picker/date-picker.component';

@Component({
  selector: 'app-facility-select',
  templateUrl: './facility-select.component.html',
  styleUrls: ['./facility-select.component.scss']
})

export class FacilitySelectComponent implements OnInit {
  @Output() emitter: EventEmitter<any> = new EventEmitter<any>();
  @ViewChild(DatePickerComponent) dateFormChild: DatePickerComponent;
  @Input() facilities;

  public myForm: FormGroup;
  public canSubmit = false;
  public openFacilities = [];
  public closedFacilities = [];
  public passesAvailable = [];
  public selectedDate = '';

  public timeConfig = {
    AM: {
      selected: false,
      disabled: true,
      offered: false,
      text: ''
    },
    PM: {
      selected: false,
      offered: false,
      disabled: true,
      text: ''
    },
    DAY: {
      selected: false,
      offered: false,
      disabled: true,
      text: ''
    }
  };

  // typically imported from configService, below are default values if no configService
  public defaultOpeningHour = 7;
  public defaultDateLimit = 1;
  public trailPassLimit = 4;
  public parkingPassLimit = 1;

  // Order of form states progressing from start to finish
  public stateOrder = ['blank', 'date', 'time', 'passes', 'complete'];
  // Initial state
  public state = 0;

  constructor(
    private fb: FormBuilder,
    private configService: ConfigService,
  ) { }

  ngOnInit(): void {
    if (this.configService) {
      this.trailPassLimit = this.configService.config['TRAIL_PASS_LIMIT'];
      this.parkingPassLimit = this.configService.config['PARKING_PASS_LIMIT'];
      this.defaultDateLimit = this.configService.config['ADVANCE_BOOKING_LIMIT'];
      this.defaultOpeningHour = this.configService.config['ADVANCE_BOOKING_HOUR'];
    }
    this.initForm();
    this.checkPassType();
    this.setFacilitiesArrays();
  }

  get bookingDaysAhead(): number {
    const facility = this.myForm.get('passType').value;
    let bookingDaysAhead = this.defaultDateLimit;

    if (facility && (facility.bookingDaysAhead || facility.bookingDaysAhead === 0)) {
      bookingDaysAhead = facility.bookingDaysAhead;
    }

    return bookingDaysAhead;
  }

  get bookingOpeningHour(): number {
    const facility = this.myForm.get('passType').value;
    let bookingOpeningHour = this.defaultOpeningHour;

    if (facility && (facility.bookingOpeningHour || facility.bookingOpeningHour === 0)) {
      bookingOpeningHour = facility.bookingOpeningHour;
    }

    return bookingOpeningHour;
  }

  get isOpeningHourPast(): boolean {
    const date = new Date();
    // check the current time in the America/Vancouver TZ (must do this step to acct for PST/PDT)
    const currentHour = date.toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/Vancouver' });
    return Boolean(parseInt(currentHour, 10) >= this.bookingOpeningHour);
  }

  get minDate(): Date {
    return new Date();
  }

  get maxDate(): Date {
    const date = new Date();
    const bookingDaysAhead = this.bookingDaysAhead;

    // if it is after the opening time in America/Vancouver, allow booking the full window.
    // Otherwise, subtract 1 from the window.
    if (this.isOpeningHourPast) {
      date.setDate(date.getDate() + bookingDaysAhead);
    } else if (bookingDaysAhead > 0) {
      date.setDate(date.getDate() + bookingDaysAhead - 1);
    }

    return date;
  }

  setFacilitiesArrays() {
    // if facility is open, show it as available.
    // if a facility is closed, show it as unavailable.
    this.openFacilities = [];
    this.closedFacilities = [];
    for (let facility in this.facilities) {
      if (this.facilities[facility].status.state === 'open') {
        this.openFacilities.push(this.facilities[facility]);
      } else {
        this.closedFacilities.push(this.facilities[facility]);
      }
    }
  }

  setTimeArrays(): void {
    // if facility has a time of day and it is not yet at capacity, show it and make available.
    // if facility has a time of day and it is at/over capacity, show it but make it unavailable.
    // if facility has a time of day and there is no capacity limit, make all times available.
    this.selectedDate = '';
    if (this.myForm.get('passType').value && this.myForm.get('passType').value.bookingTimes) {
      const facility = this.myForm.get('passType').value;
      const times = this.myForm.get('passType').value.bookingTimes;
      if (times.AM) {
        this.timeConfig.AM.offered = true;
      }
      if (times.PM) {
        this.timeConfig.PM.offered = true;
      }
      if (times.DAY) {
        this.timeConfig.DAY.offered = true;
      }
      this.selectedDate = this.getBookingDateString();
      this.timeConfig['AM'].text = this.timeConfig['PM'].text = this.timeConfig['DAY'].text = 'Unoffered';
      for (let key in times) {
        if (!facility.reservations[this.selectedDate]) {
          // This happens if there are no existing passes for the day.
          if (times[key].max > 0) {
            this.timeConfig[key].text = 'High';
          } else {
            this.timeConfig[key].text = 'Full';
            this.timeConfig[key].disabled = true;
          }
          this.timeConfig[key].disabled = false;
        } else if (!facility.reservations[this.selectedDate][key]) {
          // This happens if there are no existing passes for the specific key.
          if (times[key].max > 0) {
            this.timeConfig[key].text = 'High';
          } else {
            this.timeConfig[key].text = 'Full';
            this.timeConfig[key].disabled = true;
          }
          this.timeConfig[key].disabled = false;
        } else if (facility.reservations[this.selectedDate][key] < times[key].max) {
          // There are one or more passes that exist with a specific key.
          const currentCount = facility.reservations[this.selectedDate][key] ? facility.reservations[this.selectedDate][key] : 0;
          let capPercent = 1 - (
            currentCount /
            times[key].max
          );
          if (capPercent < .25) {
            this.timeConfig[key].text = 'Low';
          } else if (capPercent < .75) {
            this.timeConfig[key].text = 'Moderate';
          } else {
            this.timeConfig[key].text = 'High';
          }
          this.timeConfig[key].disabled = false;
        } else {
          this.timeConfig[key].text = 'Full';
          this.timeConfig[key].disabled = true;
        }
      }
    }
  }

  showTimeText(time) {
    if (!this.timeConfig[time].disabled || this.timeConfig[time].text === 'Unavailable' || this.timeConfig[time].text === 'Full') {
      return true;
    } else {
      return false;
    }
  }

  getBookingDateString(): string {
    const { year, month, day } = this.myForm.get('visitDate').value;
    // NgbDate uses 1-indexed months
    const date = new Date(year, month - 1, day);
    return date.toISOString().split('T')[0];
  }

  setPassesArray(): void {
    // if facility is trail and has >= 'singlePassLimit' passes available, allow client to book up to 'singlePassLimit' passes.
    // if facility is trail and has 1 to 'singlePassLimit' passes available, limit the number of passes to the availability left.
    // if facility has no availablilty, this should be limited in the bookingTimes field.
    // if facility has no capacity limit, allow client to book up to 'singlePassLimit' passes.
    this.passesAvailable = [];
    let numberAvailable = 0;
    if (this.myForm.get('passType').value) {
      const pass = this.myForm.get('passType').value;
      const date = this.getBookingDateString();
      if (this.myForm.get('visitTime').value) {
        const time = this.myForm.get('visitTime').value;
        // check if there are any bookings for this facilty/date/time combo existing already
        if (pass.bookingTimes[time]) {
          if (
            pass.reservations &&
            pass.reservations[date] &&
            pass.reservations[date][time]
          ) {
            // if so, check the remaining space available.
            numberAvailable = pass.bookingTimes[time].max - pass.reservations[date][time];
          } else {
            // if else, this means there is no bookings for that particular day yet.
            numberAvailable = pass.bookingTimes[time].max;
          }
        } else {
          numberAvailable = 0;
        }
      }
      if (pass.type === 'Trail' && numberAvailable > this.trailPassLimit) {
        numberAvailable = this.trailPassLimit;
      }
      if (pass.type === 'Parking' && numberAvailable > this.parkingPassLimit) {
        numberAvailable = this.parkingPassLimit;
      }
    }
    for (let i = 1; i <= numberAvailable; i++) {
      this.passesAvailable.push(i);
    }
  }

  checkPassType(): string {
    if (this.myForm.get('passType').value && this.myForm.get('passType').value.type) {
      return this.myForm.get('passType').value.type;
    }
    return null;
  }

  isDisabled(stateStr): boolean {
    if (this.state < this.stateOrder.findIndex((element) => element === stateStr)) {
      return true;
    }
    return false;
  }

  onTimeChange(time) {
    if (!this.timeConfig[time].disabled) {
      switch (time) {
        case 'AM':
          this.timeConfig.AM.selected = true;
          this.timeConfig.PM.selected = false;
          this.timeConfig.DAY.selected = false;
          this.myForm.controls['visitTime'].setValue('AM');
          break;
        case 'PM':
          this.timeConfig.AM.selected = false;
          this.timeConfig.PM.selected = true;
          this.timeConfig.DAY.selected = false;
          this.myForm.controls['visitTime'].setValue('PM');
          break;
        case 'DAY':
          this.timeConfig.AM.selected = false;
          this.timeConfig.PM.selected = false;
          this.timeConfig.DAY.selected = true;
          this.myForm.controls['visitTime'].setValue('DAY');
          break;
        default:
          break;
      }
      this.setState('passes');
    }
  }

  clearFormByState(stateStr): void {
    if (this.getStateByString(stateStr) >= this.getStateByString('passes')) {
      this.myForm.controls['passCount'].reset();
    }
    if (this.getStateByString(stateStr) < this.getStateByString('passes')) {
      this.myForm.controls['visitTime'].reset();
    }
    if (this.getStateByString(stateStr) < this.getStateByString('time')) {
      this.resetTimeConfig();
      this.dateFormChild.clearDate();
    }
    if (this.getStateByString(stateStr) < this.getStateByString('date')) {
      this.myForm.reset();
    }
  }

  resetTimeConfig() {
    this.timeConfig = {
      AM: {
        selected: false,
        offered: false,
        disabled: true,
        text: '-'
      },
      PM: {
        selected: false,
        offered: false,
        disabled: true,
        text: '-'
      },
      DAY: {
        selected: false,
        offered: false,
        disabled: true,
        text: '-'
      }
    };
  }

  getStateByString(stateStr): number {
    return this.stateOrder.findIndex((element) => element === stateStr);
  }

  setState(setState): void {
    this.clearFormByState(setState);
    this.state = this.stateOrder.findIndex((element) => element === setState);
    if (this.state === this.getStateByString('blank')) {
      this.setFacilitiesArrays();
    }
    if (this.state === this.getStateByString('time')) {
      this.resetTimeConfig();
      this.setTimeArrays();
    }
    if (this.state === this.getStateByString('passes')) {
      this.setPassesArray();
    }
  }

  initForm(): void {
    this.myForm = this.fb.group(
      {
        visitDate: ['', Validators.required],
        visitTime: ['', Validators.required],
        passType: ['', Validators.required],
        passCount: ['', Validators.required]
      }
    );
  }

  submit(): void {
    const obj = {
      visitDate: this.myForm.get('visitDate').value,
      visitTime: this.myForm.get('visitTime').value,
      passType: this.myForm.get('passType').value,
      passCount: parseInt(this.myForm.get('passCount').value, 10)
    };
    this.emitter.emit(obj);
  }
}
