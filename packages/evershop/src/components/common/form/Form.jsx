import Button from '@components/common/form/Button';
import PropTypes from 'prop-types';
import PubSub from 'pubsub-js';
import React, { useState } from 'react';
import { FORM_SUBMIT, FORM_VALIDATED } from '../../../lib/util/events';
import { serializeForm } from '../../../lib/util/formToJson';
import { get } from '../../../lib/util/get.js';
import { validator } from './validator';

export const FormContext = React.createContext();
export const FormDispatch = React.createContext();

export function Form(props) {
  const {
    id,
    action,
    method,
    isJSON = true,
    onStart,
    onComplete,
    onError,
    onSuccess,
    onValidationError,
    children,
    submitBtn = true,
    btnText,
    dataFilter
  } = props;

  const [fields, setFields] = React.useState([]);
  const formRef = React.useRef();
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState('initialized');

  const addField = (name, value, validationRules = []) => {
    setFields((previous) =>
      previous.concat({ name, value, validationRules, updated: false })
    );
  };

  const updateField = (name, value, validationRules = []) => {
    setFields((previous) =>
      previous.map((f) => {
        if (f.name === name) {
          return { name, value, validationRules, updated: true };
        } else {
          return f;
        }
      })
    );
  };

  const removeField = (name) => {
    setFields((previous) => previous.filter((f) => f.name !== name));
  };

  const validate = () => {
    const errors = {};
    fields.forEach((f) => {
      f.validationRules.forEach((r) => {
        let rule;
        // Check if r is a string or an object
        if (typeof r === 'string') {
          rule = r;
        } else {
          rule = r.rule;
        }

        const ruleValidator = validator.getRule(rule);
        if (ruleValidator === undefined) return;
        if (!ruleValidator.handler.call(fields, f.value)) {
          if (r.message) {
            errors[f.name] = r.message;
          } else {
            errors[f.name] = ruleValidator.errorMessage;
          }
        }
      });
    });

    if (Object.keys(errors).length === 0) {
      setFields(fields.map((f) => ({ ...f, error: undefined })));
    } else {
      setFields(
        fields.map((f) => {
          if (!errors[f.name]) {
            return { ...f, error: undefined };
          }
          return { ...f, error: errors[f.name] };
        })
      );
    }

    return errors;
  };

  const submit = async (e) => {
    e.preventDefault();
    setState('submitting');
    try {
      PubSub.publishSync(FORM_SUBMIT, { props });
      const errors = validate();
      PubSub.publishSync(FORM_VALIDATED, { formId: id, errors });
      if (Object.keys(errors).length === 0) {
        const formData = new FormData(document.getElementById(id));
        setLoading(true);
        if (onStart) {
          await onStart();
        }
        const response = await fetch(
          // TODO: Replace by Axios
          action,
          {
            method,
            body:
              isJSON === true
                ? JSON.stringify(serializeForm(formData.entries(), dataFilter))
                : formData,
            headers: {
              'X-Requested-With': 'XMLHttpRequest',
              ...(isJSON === true ? { 'Content-Type': 'application/json' } : {})
            }
          }
        );

        if (
          !response.headers.get('content-type') ||
          !response.headers.get('content-type').includes('application/json')
        ) {
          throw new TypeError('Something wrong. Please try again');
        }

        const responseJson = await response.json();
        if (get(responseJson, 'data.redirectUrl') !== undefined) {
          window.location.href = responseJson.data.redirectUrl;
          return true;
        }

        if (onSuccess) {
          await onSuccess(responseJson);
        }
        setState('submitSuccess'); // This indicates that the form has been submitted successfully. It does not mean that the business logic is successful.
      } else {
        setState('validateFailed');
        if (onValidationError) {
          await onValidationError();
        }
        // Get the first field with error
        const firstFieldWithError = Object.keys(errors)[0];
        // Get the first element with the name of the field with error
        const firstElementWithError =
          document.getElementsByName(firstFieldWithError)[0];
        // Focus on the first element with error
        if (firstElementWithError) {
          firstElementWithError.focus();
        }
      }
    } catch (error) {
      setState('submitFailed');
      if (onError) {
        await onError(error);
      }
      throw error;
    } finally {
      setLoading(false);
      setState('submitted');
      if (onComplete) {
        await onComplete();
      }
    }
    return true;
  };

  return (
    <FormContext.Provider
      value={{
        fields,
        addField,
        updateField,
        removeField,
        state,
        ...props
      }}
    >
      <FormDispatch.Provider value={{ submit, validate }}>
        <form
          ref={formRef}
          id={id}
          action={action}
          method={method}
          onSubmit={(e) => submit(e)}
        >
          {children}
          {submitBtn === true && (
            <div className="form-submit-button flex border-t border-divider mt-4 pt-4">
              <Button
                title={btnText || 'Save'}
                onAction={() => {
                  document
                    .getElementById(id)
                    .dispatchEvent(
                      new Event('submit', { cancelable: true, bubbles: true })
                    );
                }}
                isLoading={loading}
                type="submit"
              />
            </div>
          )}
        </form>
      </FormDispatch.Provider>
    </FormContext.Provider>
  );
}

Form.propTypes = {
  action: PropTypes.string,
  btnText: PropTypes.string,
  children: PropTypes.oneOfType([
    PropTypes.arrayOf(PropTypes.node),
    PropTypes.node
  ]).isRequired,
  id: PropTypes.string.isRequired,
  method: PropTypes.string,
  onComplete: PropTypes.func,
  onError: PropTypes.func,
  onStart: PropTypes.func,
  onSuccess: PropTypes.func,
  onValidationError: PropTypes.func,
  submitBtn: PropTypes.bool,
  isJSON: PropTypes.bool,
  dataFilter: PropTypes.func
};

Form.defaultProps = {
  btnText: undefined,
  onComplete: undefined,
  onError: undefined,
  onStart: undefined,
  onSuccess: undefined,
  onValidationError: undefined,
  submitBtn: true,
  isJSON: true,
  action: '',
  method: 'POST',
  dataFilter: undefined
};

export const useFormContext = () => React.useContext(FormContext);
export const useFormDispatch = () => React.useContext(FormDispatch);
